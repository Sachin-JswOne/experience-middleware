import { Logger } from '@nestjs/common';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';
import { safeDebug } from 'src/utils/common-functions.util';

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

interface DashboardSection<T> {
  success: boolean;
  data?: T;
  error?: string;
  httpStatus?: number;
}

export interface CustomerDashboardResponse {
  orderSummary: DashboardSection<OrderSummary>;
  credit: DashboardSection<Credit>;
  ledger: DashboardSection<Ledger>;
  paymentsDue: DashboardSection<PaymentsDue>;
}

interface OrderSummary {
  shipmentDetails: { inTransit: number; nextDeliveryDate: string | null };
  orderDetails: { active: number; deliveredThisMonth: number };
  invoiceDetails: { invoicedAmount: number; invoiceCount: number; hasActiveOrder: boolean };
}

interface Credit {
  isCreditEligible: boolean;
  amount: number;
}

interface LedgerEntity {
  code: string;
  name: string;
  amount: number;
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

/**
 * The credit-eligibility API takes the GSTIN as a path segment while the other
 * dashboard targets take it as a query param, so it is lifted out of the request
 * here and appended to the target URL. Throwing fails only this target — the rest
 * of the dashboard still renders.
 */
export function transformCreditEligibilityRequest(request: BaseRequest): BaseRequest {
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

  return {
    orderSummary: buildSection('orderSummary', responses['orderSummary'], mapOrderSummary),
    credit: buildSection('credit', responses['credit'], mapCredit),
    ledger: buildSection('ledger', responses['ledger'], mapLedger),
    paymentsDue: buildSection('paymentsDue', responses['paymentsDue'], mapPaymentsDue),
  };
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

function mapCredit(payload: any): Credit {
  return {
    isCreditEligible: Boolean(payload?.isCreditEligible ?? payload?.eligible ?? false),
    amount: toNumber(payload?.amount ?? payload?.eligibleAmount ?? payload?.creditLimit),
  };
}

function mapLedger(payload: any): Ledger {
  const rows = toArray(payload?.entities ?? payload?.ledgerDetails ?? payload);

  return {
    updatedOn: payload?.updatedOn ?? payload?.lastUpdatedOn ?? payload?.asOnDate ?? null,
    entities: rows.map((row: any) => {
      const code = entityCode(row);
      return {
        code,
        name: entityName(row, code),
        amount: toNumber(row?.amount ?? row?.balance ?? row?.ledgerBalance ?? row?.totalAmount),
      };
    }),
  };
}

function mapPaymentsDue(payload: any): PaymentsDue {
  const rows = toArray(payload?.entities ?? payload?.paymentDueList ?? payload?.dueList ?? payload);
  const byEntity = new Map<string, PaymentsDueEntity>();

  for (const row of rows) {
    const code = entityCode(row);
    const entity = byEntity.get(code) ?? emptyPaymentsDueEntity(code, entityName(row, code));
    byEntity.set(code, entity);

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
    const bucket = BUCKET_BY_STATUS[normalizeStatus(row?.dueStatus ?? row?.status ?? row?.stage)];
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

  return { entities: [...byEntity.values()] };
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

function normalizeStatus(status: any): string {
  return String(status ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

/** Whole days from today (UTC) to `date`; 0 is today, negative is in the past. */
function daysUntil(date: unknown): number | null {
  if (typeof date !== 'string' && typeof date !== 'number' && !(date instanceof Date)) {
    return null;
  }
  const due = new Date(date);
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((startOfDay(due) - startOfDay(new Date())) / 86_400_000);
}

/**
 * Amounts arrive either as plain numbers or as the platform `AmountDetails`
 * object (`{ centAmount, precision }`). Normalises both to a plain number.
 */
function toNumber(value: any): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object' && 'centAmount' in value) {
    const precision = toNumber(value.precision);
    return toNumber(value.centAmount) / Math.pow(10, precision);
  }
  return 0;
}

function toArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}
