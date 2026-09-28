import { Logger } from '@nestjs/common';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';
import { safeDebug } from 'src/utils/common-functions.util';
import { daysUntil, normalizeStatus, roundAmount, toArray, toNumber } from 'src/utils/data.util';
import { getQueryFromContext } from 'src/utils/request-context.util';
import { moveBodyToQueryParams } from './general.transformers';

/**
 * Customer dashboard aggregate.
 *
 * Merges four independent downstream calls into the single envelope the dashboard
 * consumes. Every section carries its own `success` flag: a target that fails —
 * including with 401/403 — degrades only its own card, the rest still render.
 * The route sets `continueOnUnauthorized` so ProxyService does not abort the
 * whole aggregate on an auth failure from any single target.
 *
 * Target names in route-config.json must match the section keys below.
 */

/** Days ahead that count towards `dueInDaysAmount` on the payments-due strip. */
const DUE_IN_DAYS_WINDOW = 3;

/** Fallback display names when a downstream returns only the entity code. */
const ENTITY_NAMES: Record<string, string> = {
  JODL: 'JSW One Distribution Limited',
  JOPL: 'JSW One Platforms Limited',
};

export type DashboardSectionKey = 'orderSummary' | 'credit' | 'ledger' | 'paymentsDue' | 'creditBanner';

/** Canonical section order; also the order keys appear in the merged response. */
const DASHBOARD_SECTIONS: DashboardSectionKey[] = [
  'orderSummary',
  'credit',
  'ledger',
  'paymentsDue',
  'creditBanner',
];

/**
 * Query param that narrows the dashboard to a subset of sections, e.g.
 * `?sections=credit,ledger`. Repeating the param works too. Unselected sections
 * are neither fetched nor returned; omitting the param returns everything.
 */
const SECTIONS_PARAM = 'sections';

/**
 * The payments-due API is scoped to a single legal entity via a mandatory
 * `applicationName` query param, so the dashboard calls it once per entity and
 * the two responses are folded back into one `paymentsDue` section. Target names
 * must match the corresponding entries in route-config.json; list order is the
 * order the entities appear in the merged response.
 */
const PAYMENTS_DUE_TARGETS: { target: string; code: string }[] = [
  { target: 'paymentsDueJODL', code: 'JODL' },
  { target: 'paymentsDueJOPL', code: 'JOPL' },
];

/**
 * The ledger API keys its response by payment transaction type
 * (`{ NODAL: {...}, NON_NODAL: {...} }`) while the dashboard reports against the
 * legal entity that owns the balance, so each key is resolved to its entity.
 */
const LEDGER_ENTITY_BY_TRANSACTION_TYPE: Record<string, string> = {
  NODAL: 'JOPL',
  NON_NODAL: 'JODL',
};

/** Order ledger entities appear in the merged response; matches PAYMENTS_DUE_TARGETS. */
const LEDGER_ENTITY_ORDER: string[] = ['JODL', 'JOPL'];

type BucketKey = 'overdue' | 'dueToday' | 'orderConfirmation' | 'materialDispatch';

/**
 * Maps a payments-due row's status/stage onto a strip bucket. Keys are compared
 * uppercased with non-alphanumerics collapsed to `_`, so `Material Dispatch`,
 * `material-dispatch` and `MATERIAL_DISPATCH` all land in the same bucket.
 */
const BUCKET_BY_STATUS: Record<string, BucketKey> = {
  OVERDUE: 'overdue',
  OVER_DUE: 'overdue',
  PAST_DUE: 'overdue',
  DUE_TODAY: 'dueToday',
  TODAY: 'dueToday',
  ORDER_CONFIRMATION: 'orderConfirmation',
  ORDER_CONFIRMED: 'orderConfirmation',
  MATERIAL_DISPATCH: 'materialDispatch',
  DISPATCH: 'materialDispatch',
};

/**
 * A payment tied to a stage of the order lands in that stage's bucket whatever its
 * due date; only the remaining document types (advance invoices and the like) are
 * bucketed by how overdue they are.
 */
const BUCKET_BY_DOCUMENT_TYPE: Record<string, BucketKey> = {
  FOR_ORDER_CONFIRMATION: 'orderConfirmation',
  FOR_ORDER_DISPATCH: 'materialDispatch',
};

interface DashboardSection<T> {
  success: boolean;
  data?: T;
  error?: string;
  httpStatus?: number;
}

/** Only the sections asked for are present; every section when `sections` is omitted. */
export interface CustomerDashboardResponse {
  orderSummary?: DashboardSection<OrderSummary>;
  credit?: DashboardSection<Credit>;
  ledger?: DashboardSection<Ledger>;
  paymentsDue?: DashboardSection<PaymentsDue>;
  creditBanner?: DashboardSection<any>;
}

interface OrderSummary {
  shipmentDetails: { inTransit: number; nextDeliveryDate: string | null };
  orderDetails: { active: number; deliveredThisMonth: number };
  invoiceDetails: { invoicedAmount: number; invoiceCount: number; hasActiveOrder: boolean };
}

interface Credit {
  /**
   * The customer can still apply for credit. A customer who already holds credit
   * is no longer eligible, so this flag only carries meaning when `amount` is 0.
   */
  isCreditEligible: boolean;
  /** Spendable credit across every limit; 0 for a customer who holds none. */
  amount: number;
}

/** The two independent states the lead-generation API reports. */
interface CreditEligibility {
  canApply: boolean;
  hasExistingCredit: boolean;
}

interface LedgerEntity {
  code: string;
  name: string;
  /** Gross ledger balance, amounts blocked against open orders included. */
  amount: number;
  /** Spendable balance: `amount` less `blockedAmount`. */
  usableAmount: number;
  /** Total currently blocked against open orders. */
  blockedAmount: number;
}

interface Ledger {
  updatedOn: string | null;
  entities: LedgerEntity[];
}

interface PaymentsDueEntity {
  code: string;
  name: string;
  buckets: Record<BucketKey, number>;
  dueInDaysAmount: number;
  dueLaterAmount: number;
}

interface PaymentsDue {
  entities: PaymentsDueEntity[];
}

interface SectionSelection {
  selected: DashboardSectionKey[];
  unknown: string[];
}

/**
 * Reads the `sections` selection off the inbound query. Request transformers run
 * against a rebuilt downstream request that no longer carries the caller's query
 * string, and the response transformer never sees the request at all, so both
 * read it from the request context instead.
 */
function requestedSections(): SectionSelection {
  const raw = getQueryFromContext()[SECTIONS_PARAM];
  const tokens = (Array.isArray(raw) ? raw : [raw])
    .flatMap((value) => String(value ?? '').split(','))
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { selected: [...DASHBOARD_SECTIONS], unknown: [] };
  }

  const selected: DashboardSectionKey[] = [];
  const unknown: string[] = [];

  for (const token of tokens) {
    const match = DASHBOARD_SECTIONS.find(
      (section) => section.toLowerCase() === token.toLowerCase(),
    );
    if (!match) {
      unknown.push(token);
    } else if (!selected.includes(match)) {
      selected.push(match);
    }
  }

  return { selected, unknown };
}

/**
 * Suppresses a target whose section was not asked for: a request carrying `skip`
 * makes ProxyService drop the downstream call entirely. An unrecognised section
 * name skips every target — `mergeCustomerDashboard` then rejects the request
 * with a 400 rather than any downstream traffic being spent on it.
 */
function skipUnlessRequested(
  request: BaseRequest,
  section: DashboardSectionKey,
): BaseRequest | null {
  const { selected, unknown } = requestedSections();

  if (unknown.length === 0 && selected.includes(section)) {
    return null;
  }

  safeDebug(Logger, () => `Customer Dashboard → skipping unrequested section: ${section}`);
  return { ...request, skip: true };
}

export function transformOrderSummaryRequest(request: BaseRequest): BaseRequest {
  return skipUnlessRequested(request, 'orderSummary') ?? moveBodyToQueryParams(request);
}

export function transformLedgerRequest(request: BaseRequest): BaseRequest {
  return skipUnlessRequested(request, 'ledger') ?? moveBodyToQueryParams(request);
}

/**
 * The credit-eligibility API takes the GSTIN as a path segment while the other
 * dashboard targets take it as a query param, so it is lifted out of the request
 * here and appended to the target URL. Throwing fails only this target — the rest
 * of the dashboard still renders.
 */
export function transformCreditEligibilityRequest(request: BaseRequest): BaseRequest {
  const skipped = skipUnlessRequested(request, 'credit');
  if (skipped) {
    return skipped;
  }

  const gstin = request.body?.gstin ?? request.url.searchParams.get('gstin');

  if (!gstin) {
    throw new CustomError('gstin is required to check credit eligibility', 400);
  }

  const transformedRequest: BaseRequest = { ...request, body: null };
  transformedRequest.url.pathname = `${transformedRequest.url.pathname.replace(
    /\/$/,
    '',
  )}/${encodeURIComponent(String(gstin))}`;
  transformedRequest.url.search = '';

  return transformedRequest;
}

/**
 * Second half of the credit card: the credit-limits list the spendable amount is
 * summed from. It is fetched in parallel with the eligibility call and discarded
 * when eligibility says no, so it shares the `credit` section's skip flag.
 */
export function transformCreditDetailsRequest(request: BaseRequest): BaseRequest {
  return skipUnlessRequested(request, 'credit') ?? moveBodyToQueryParams(request);
}

/**
 * Scopes a payments-due call to one legal entity. Body params are moved onto the
 * query string as for the other dashboard targets, then `applicationName` is
 * forced — the caller cannot override it, since the target it is attached to
 * decides which entity it represents.
 */
function scopeToApplication(request: BaseRequest, applicationName: string): BaseRequest {
  const skipped = skipUnlessRequested(request, 'paymentsDue');
  if (skipped) {
    return skipped;
  }

  const transformedRequest = moveBodyToQueryParams(request);
  transformedRequest.url.searchParams.set('applicationName', applicationName);
  return transformedRequest;
}
export function transformBannerRequest(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
    body: request.body?.creditBanner,
  };

  return moveBodyToQueryParams(transformedRequest);
}
export function transformPaymentsDueJodlRequest(request: BaseRequest): BaseRequest {
  return scopeToApplication(request, 'JODL');
}

export function transformPaymentsDueJoplRequest(request: BaseRequest): BaseRequest {
  return scopeToApplication(request, 'JOPL');
}

export function mergeCustomerDashboard(
  aggregatedResponses: AggregatedResponse[],
): CustomerDashboardResponse {
  const responses = (aggregatedResponses ?? []).reduce(
    (acc, response) => {
      if (response?.target) {
        acc[response.target] = response;
      }
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  safeDebug(
    Logger,
    () =>
      `Customer Dashboard → mergeCustomerDashboard → targets: ${JSON.stringify(
        Object.keys(responses),
      )}`,
  );

  const { selected, unknown } = requestedSections();

  if (unknown.length > 0) {
    throw new CustomError(
      `Unknown ${SECTIONS_PARAM} value(s): ${unknown.join(', ')}. Valid values: ${DASHBOARD_SECTIONS.join(', ')}`,
      400,
    );
  }

  const response: CustomerDashboardResponse = {};

  for (const section of DASHBOARD_SECTIONS) {
    if (!selected.includes(section)) {
      continue;
    }

    switch (section) {
      case 'orderSummary':
        response.orderSummary = buildSection(
          'orderSummary',
          responses.orderSummary,
          mapOrderSummary,
        );
        break;
      case 'credit':
        response.credit = buildCreditSection(responses);
        break;
      case 'ledger':
        response.ledger = buildSection('ledger', responses.ledger, mapLedger);
        break;
      case 'paymentsDue':
        response.paymentsDue = buildPaymentsDueSection(responses);
        break;
      case 'creditBanner':
        response.creditBanner = buildSection(
          'creditBanner',
          responses.creditBanner,
          (payload) => payload,
        );
        break;
    }
  }

  return response;
}

function buildSection<T>(
  name: string,
  response: AggregatedResponse | undefined,
  mapper: (payload: any) => T,
): DashboardSection<T> {
  if (!response) {
    Logger.error(`Customer Dashboard → no response for target: ${name}`);
    return { success: false, error: `No response from ${name}` };
  }

  if (!response.success) {
    Logger.error(
      `Customer Dashboard → target ${name} failed with status ${response.httpStatus}: ${response.error}`,
    );
    return {
      success: false,
      error: response.error ?? `${name} request failed`,
      httpStatus: response.httpStatus,
    };
  }

  try {
    return { success: true, data: mapper(unwrapPayload(response.data)) };
  } catch (error) {
    Logger.error(
      `Customer Dashboard → failed to transform target ${name}: ${(error as Error)?.message}`,
    );
    return { success: false, error: (error as Error)?.message ?? `Failed to transform ${name}` };
  }
}

/**
 * Downstream services wrap their payload as `{ status, data, error, success }`.
 * Unwraps that envelope and surfaces a downstream-reported failure as an error
 * so the section is marked unsuccessful rather than silently empty.
 */
function unwrapPayload(payload: any): any {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload) {
    if (payload.success === false) {
      throw new Error(String(payload.error ?? 'Downstream reported failure'));
    }
    if ('success' in payload || 'status' in payload) {
      return payload.data;
    }
  }
  return payload;
}

function mapOrderSummary(payload: any): OrderSummary {
  const shipmentDetails = payload?.shipmentDetails ?? {};
  const orderDetails = payload?.orderDetails ?? {};
  const invoiceDetails = payload?.invoiceDetails ?? {};
  const active = toNumber(orderDetails.active);

  return {
    shipmentDetails: {
      inTransit: toNumber(shipmentDetails.inTransit),
      nextDeliveryDate: shipmentDetails.nextDeliveryDate ?? null,
    },
    orderDetails: {
      active,
      deliveredThisMonth: toNumber(orderDetails.deliveredThisMonth),
    },
    invoiceDetails: {
      invoicedAmount: toNumber(invoiceDetails.invoicedAmount ?? invoiceDetails.invoicedThisMonth),
      invoiceCount: toNumber(invoiceDetails.invoiceCount),
      // Derived, not sent by the dashboard API: an active order count drives the flag.
      hasActiveOrder: active > 0,
    },
  };
}

/**
 * The credit card is fed by two calls, and the customer is in exactly one of two
 * states. Either they hold credit — the credit-limits list carries the amount and
 * they are no longer eligible to apply — or they do not, and only the eligibility
 * flag matters. The limits list is consulted only in the first state, so a customer
 * who can merely apply never has their card failed by a list of limits they do not
 * yet have.
 */
function buildCreditSection(
  responses: Record<string, AggregatedResponse>,
): DashboardSection<Credit> {
  const eligibility = buildSection('credit', responses.credit, mapCreditEligibility);

  if (!eligibility.success || !eligibility.data) {
    return { success: false, error: eligibility.error, httpStatus: eligibility.httpStatus };
  }

  const { canApply, hasExistingCredit } = eligibility.data;

  if (!hasExistingCredit) {
    return { success: true, data: { isCreditEligible: canApply, amount: 0 } };
  }

  const details = buildSection('creditDetails', responses.creditDetails, sumUsableCredit);

  if (!details.success) {
    return { success: false, error: details.error, httpStatus: details.httpStatus };
  }

  // Holding credit ends eligibility, so the flag is forced off rather than trusted
  // from the payload; the amount is what the card reads in this state.
  return { success: true, data: { isCreditEligible: false, amount: details.data ?? 0 } };
}

/**
 * `isCreditLeadGenerationEligible` answers "can this customer apply?", which the
 * API turns off once a lead exists — so it is not a signal that the customer has
 * credit. An existing lead carrying a `creditAmount` is; that amount is a display
 * range (`"₹25 Lakhs to ₹50 Lakhs"`), so it is read as a flag, never as a number.
 */
function mapCreditEligibility(payload: any): CreditEligibility {
  return {
    canApply: Boolean(
      payload?.isCreditLeadGenerationEligible ?? payload?.isCreditEligible ?? payload?.eligible,
    ),
    hasExistingCredit: Boolean(payload?.customerCreditLead?.creditAmount),
  };
}

/**
 * Totals the spendable balance across the customer's credit limits. Limits flagged
 * as not visible to the customer are left out — they are not part of the number the
 * dashboard is showing them. Rounded because each amount is read in hundredths and
 * the additions otherwise drift.
 */
function sumUsableCredit(payload: any): number {
  const total: number = toArray(payload?.creditLimits ?? payload).reduce(
    (sum: number, row: any) =>
      row?.visibleToCustomer === false
        ? sum
        : sum + toNumber(row?.creditUsable ?? row?.usableLedgerBalance),
    0,
  );

  return roundAmount(total);
}

function mapLedger(payload: any): Ledger {
  const rows = ledgerRows(payload);

  const entities = rows.map((row: any) => {
    const code = entityCode(row);
    const amount = toNumber(row?.amount ?? row?.balance ?? row?.ledgerBalance ?? row?.totalAmount);
    const blockedAmount = toNumber(row?.totalOrderBlockAmount ?? row?.blockedAmount);
    const usable = row?.usableLedgerBalance ?? row?.usableAmount;

    return {
      code,
      name: entityName(row, code),
      amount,
      // Derived when the downstream sends only the gross balance; rounded because
      // the subtraction reintroduces float noise the source amounts do not carry.
      usableAmount:
        usable === undefined || usable === null
          ? roundAmount(amount - blockedAmount)
          : toNumber(usable),
      blockedAmount,
    };
  });

  entities.sort((a, b) => ledgerEntityRank(a.code) - ledgerEntityRank(b.code));

  return { updatedOn: ledgerUpdatedOn(payload, rows), entities };
}

/** Prefers an envelope-level date, falling back to the first row that carries one. */
function ledgerUpdatedOn(payload: any, rows: any[]): string | null {
  for (const source of [payload, ...rows]) {
    const date = source?.updatedOn ?? source?.lastUpdatedOn ?? source?.asOnDate;
    if (date) {
      return String(date);
    }
  }
  return null;
}

/**
 * Normalises the two ledger payload shapes into rows. The live API returns an
 * object keyed by payment transaction type; array-shaped payloads (`entities` /
 * `ledgerDetails`, or a bare array) carry the entity code on the row itself.
 */
function ledgerRows(payload: any): any[] {
  const listed = toArray(payload?.entities ?? payload?.ledgerDetails ?? payload);
  if (listed.length > 0 || !payload || typeof payload !== 'object') {
    return listed;
  }

  return Object.entries(payload as Record<string, unknown>)
    .filter(
      ([key, value]) =>
        key in LEDGER_ENTITY_BY_TRANSACTION_TYPE && Boolean(value) && typeof value === 'object',
    )
    .map(([key, value]) => ({
      ...(value as Record<string, any>),
      code: LEDGER_ENTITY_BY_TRANSACTION_TYPE[key],
    }));
}

/** Unknown codes sort after the known entities, keeping their relative order. */
function ledgerEntityRank(code: string): number {
  const index = LEDGER_ENTITY_ORDER.indexOf(code);
  return index === -1 ? LEDGER_ENTITY_ORDER.length : index;
}

/**
 * Folds the per-entity payments-due calls back into a single section. Each target
 * contributes exactly one entity, so a failure drops only that entity; the section
 * fails only when every entity call failed.
 */
function buildPaymentsDueSection(
  responses: Record<string, AggregatedResponse>,
): DashboardSection<PaymentsDue> {
  const entities: PaymentsDueEntity[] = [];
  const failures: DashboardSection<PaymentsDueEntity>[] = [];

  for (const { target, code } of PAYMENTS_DUE_TARGETS) {
    const section = buildSection(target, responses[target], (payload) =>
      mapPaymentsDueEntity(payload, code),
    );

    if (section.success && section.data) {
      entities.push(section.data);
    } else {
      failures.push(section);
    }
  }

  if (entities.length === 0) {
    const [firstFailure] = failures;
    return {
      success: false,
      error: firstFailure?.error ?? 'No response from paymentsDue',
      httpStatus: firstFailure?.httpStatus,
    };
  }

  return { success: true, data: { entities } };
}

/**
 * Maps one entity-scoped payments-due response. The entity code comes from the
 * target that produced the payload, not from the rows, so an entity with no dues
 * still renders as a zeroed row.
 */
function mapPaymentsDueEntity(payload: any, code: string): PaymentsDueEntity {
  const rows = toArray(
    payload?.entities ??
      payload?.customerPaymentDue ??
      payload?.paymentDueList ??
      payload?.dueList ??
      payload,
  );
  const entity = emptyPaymentsDueEntity(code, ENTITY_NAMES[code] ?? code);

  for (const row of rows) {
    const name = row?.name ?? row?.entityDisplayName;
    if (name) {
      entity.name = name;
    }

    // Already bucketed by the downstream — merge as-is instead of re-deriving.
    if (row?.buckets && typeof row.buckets === 'object') {
      for (const key of Object.keys(entity.buckets) as BucketKey[]) {
        entity.buckets[key] += toNumber(row.buckets[key]);
      }
      entity.dueInDaysAmount += toNumber(row.dueInDaysAmount);
      entity.dueLaterAmount += toNumber(row.dueLaterAmount);
      continue;
    }

    const amount = toNumber(
      row?.amount ?? row?.dueAmount ?? row?.pendingAmount ?? row?.totalDueAmount,
    );
    const bucket = bucketForRow(row);
    if (bucket) {
      entity.buckets[bucket] += amount;
    }

    const days = daysUntil(row?.dueDate ?? row?.paymentDueDate);
    if (days === null) {
      continue;
    }
    if (days > 0 && days <= DUE_IN_DAYS_WINDOW) {
      entity.dueInDaysAmount += amount;
    } else if (days > DUE_IN_DAYS_WINDOW) {
      entity.dueLaterAmount += amount;
    }
  }

  for (const key of Object.keys(entity.buckets) as BucketKey[]) {
    entity.buckets[key] = roundAmount(entity.buckets[key]);
  }
  entity.dueInDaysAmount = roundAmount(entity.dueInDaysAmount);
  entity.dueLaterAmount = roundAmount(entity.dueLaterAmount);

  return entity;
}

/**
 * Picks the strip bucket for one due row. The document type wins where it names an
 * order stage; everything else falls through to how overdue the payment is, read
 * from an explicit due status when the downstream sends one and from `overdueDays`
 * otherwise. A future-dated row of any other type lands in no bucket — it is still
 * counted in the due-in-days / due-later totals.
 */
function bucketForRow(row: any): BucketKey | undefined {
  const byDocumentType = BUCKET_BY_DOCUMENT_TYPE[normalizeStatus(row?.documentType)];
  if (byDocumentType) {
    return byDocumentType;
  }

  const byStatus = dueStatusBucket(row?.dueStatus ?? row?.status ?? row?.stage);
  if (byStatus) {
    return byStatus;
  }

  const overdueDays = row?.overdueDays;
  if (typeof overdueDays !== 'number' || !Number.isFinite(overdueDays)) {
    return undefined;
  }
  if (overdueDays >= 1) {
    return 'overdue';
  }
  return overdueDays === 0 ? 'dueToday' : undefined;
}

/** Matches whole status values first, then the `Overdue by >=1 days` style prefixes. */
function dueStatusBucket(status: any): BucketKey | undefined {
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return undefined;
  }
  if (BUCKET_BY_STATUS[normalized]) {
    return BUCKET_BY_STATUS[normalized];
  }
  if (normalized.startsWith('OVERDUE')) {
    return 'overdue';
  }
  return normalized.startsWith('DUE_TODAY') ? 'dueToday' : undefined;
}

function emptyPaymentsDueEntity(code: string, name: string): PaymentsDueEntity {
  return {
    code,
    name,
    buckets: { overdue: 0, dueToday: 0, orderConfirmation: 0, materialDispatch: 0 },
    dueInDaysAmount: 0,
    dueLaterAmount: 0,
  };
}

function entityCode(row: any): string {
  return String(row?.code ?? row?.entityCode ?? row?.entityName ?? row?.entity ?? '').toUpperCase();
}

function entityName(row: any, code: string): string {
  return row?.name ?? row?.entityDisplayName ?? ENTITY_NAMES[code] ?? code;
}
