import {
  mergeCustomerDashboard,
  transformCreditEligibilityRequest,
  transformLedgerRequest,
  transformOrderSummaryRequest,
  transformPaymentsDueJodlRequest,
  transformPaymentsDueJoplRequest,
} from '../dashboard.transformers';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { requestContext } from 'src/utils/request-context.util';

/** Runs `fn` as if the inbound request carried `query`. */
const withQuery = <T>(query: Record<string, any>, fn: () => T): T =>
  requestContext.run({ query }, fn);

const ok = (target: string, data: any): AggregatedResponse => ({ target, success: true, data });

const failed = (target: string, httpStatus: number, error: string): AggregatedResponse => ({
  target,
  success: false,
  httpStatus,
  error,
});

const orderSummaryPayload = {
  status: 'OK',
  data: {
    shipmentDetails: { inTransit: 3, nextDeliveryDate: '2026-09-18' },
    orderDetails: { active: 189, deliveredThisMonth: 0 },
    invoiceDetails: { invoicedThisMonth: 1365500, invoiceCount: 14 },
  },
  error: null,
  success: true,
};

const iso = (daysFromToday: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
};

describe('mergeCustomerDashboard', () => {
  it('maps all four sections when every target succeeds', () => {
    const result = mergeCustomerDashboard([
      ok('orderSummary', orderSummaryPayload),
      ok('credit', { isCreditEligible: true, amount: 260500 }),
      ok('ledger', {
        updatedOn: '2026-08-20',
        entities: [
          { code: 'JODL', name: 'JSW One Distribution Limited', amount: 2260500 },
          { code: 'JOPL', amount: 2260500 },
        ],
      }),
      ok('paymentsDueJODL', {
        entities: [
          {
            buckets: {
              overdue: 1200000,
              dueToday: 500000,
              orderConfirmation: 500000,
              materialDispatch: 60500,
            },
            dueInDaysAmount: 300000,
            dueLaterAmount: 150000,
          },
        ],
      }),
    ]);

    expect(result.orderSummary).toEqual({
      success: true,
      data: {
        shipmentDetails: { inTransit: 3, nextDeliveryDate: '2026-09-18' },
        orderDetails: { active: 189, deliveredThisMonth: 0 },
        invoiceDetails: { invoicedAmount: 1365500, invoiceCount: 14, hasActiveOrder: true },
      },
    });
    expect(result.credit).toEqual({
      success: true,
      data: { isCreditEligible: true, amount: 260500 },
    });
    // Falls back to the well-known entity name when the downstream sends only a code.
    expect(result.ledger?.data?.entities[1].name).toBe('JSW One Platforms Limited');
    expect(result.paymentsDue?.data?.entities[0]).toEqual({
      code: 'JODL',
      name: 'JSW One Distribution Limited',
      buckets: {
        overdue: 1200000,
        dueToday: 500000,
        orderConfirmation: 500000,
        materialDispatch: 60500,
      },
      dueInDaysAmount: 300000,
      dueLaterAmount: 150000,
    });
  });

  it('marks only the failing section when a target returns 401', () => {
    const result = mergeCustomerDashboard([
      ok('orderSummary', orderSummaryPayload),
      failed('credit', 401, 'Unauthorized'),
      ok('ledger', { updatedOn: '2026-08-20', entities: [] }),
      ok('paymentsDueJODL', { entities: [] }),
      ok('paymentsDueJOPL', { entities: [] }),
    ]);

    expect(result.credit).toEqual({ success: false, error: 'Unauthorized', httpStatus: 401 });
    expect(result.orderSummary?.success).toBe(true);
    expect(result.ledger?.success).toBe(true);
    expect(result.paymentsDue?.success).toBe(true);
  });

  it('marks a section unsuccessful when its target is missing from the aggregate', () => {
    const result = mergeCustomerDashboard([ok('orderSummary', orderSummaryPayload)]);

    expect(result.ledger).toEqual({ success: false, error: 'No response from ledger' });
    expect(result.paymentsDue?.success).toBe(false);
  });

  it('marks a section unsuccessful when the downstream envelope reports failure', () => {
    const result = mergeCustomerDashboard([
      ok('credit', { success: false, error: 'GSTIN not found', data: null }),
    ]);

    expect(result.credit).toEqual({ success: false, error: 'GSTIN not found' });
  });

  it('drives hasActiveOrder off the active order count', () => {
    const result = mergeCustomerDashboard([
      ok('orderSummary', {
        ...orderSummaryPayload,
        data: { ...orderSummaryPayload.data, orderDetails: { active: 0, deliveredThisMonth: 4 } },
      }),
    ]);

    expect(result.orderSummary?.data?.invoiceDetails.hasActiveOrder).toBe(false);
  });

  it('defaults missing amounts and counts to zero rather than undefined', () => {
    const result = mergeCustomerDashboard([ok('orderSummary', { data: {}, success: true })]);

    expect(result.orderSummary?.data).toEqual({
      shipmentDetails: { inTransit: 0, nextDeliveryDate: null },
      orderDetails: { active: 0, deliveredThisMonth: 0 },
      invoiceDetails: { invoicedAmount: 0, invoiceCount: 0, hasActiveOrder: false },
    });
  });

  it('normalises centAmount objects to plain numbers', () => {
    const result = mergeCustomerDashboard([
      ok('ledger', {
        updatedOn: '2026-08-20',
        entities: [{ code: 'JODL', amount: { centAmount: 226050000, precision: 2 } }],
      }),
    ]);

    expect(result.ledger?.data?.entities[0].amount).toBe(2260500);
  });

  it('buckets each entity-scoped payments-due list under its own target', () => {
    const result = mergeCustomerDashboard([
      ok('paymentsDueJODL', {
        dueList: [
          { dueStatus: 'OVERDUE', amount: 1200000, dueDate: iso(-5) },
          { dueStatus: 'Due Today', amount: 500000, dueDate: iso(0) },
          { dueStatus: 'Material Dispatch', amount: 60500, dueDate: iso(2) },
          { dueStatus: 'ORDER_CONFIRMATION', amount: 500000, dueDate: iso(10) },
        ],
      }),
      ok('paymentsDueJOPL', { dueList: [] }),
    ]);

    const [jodl, jopl] = result.paymentsDue!.data!.entities;
    expect(jodl).toEqual({
      code: 'JODL',
      name: 'JSW One Distribution Limited',
      buckets: {
        overdue: 1200000,
        dueToday: 500000,
        orderConfirmation: 500000,
        materialDispatch: 60500,
      },
      // within the 3-day window / beyond it
      dueInDaysAmount: 60500,
      dueLaterAmount: 500000,
    });
    // An entity with no dues still renders as a zeroed row.
    expect(jopl).toEqual({
      code: 'JOPL',
      name: 'JSW One Platforms Limited',
      buckets: { overdue: 0, dueToday: 0, orderConfirmation: 0, materialDispatch: 0 },
      dueInDaysAmount: 0,
      dueLaterAmount: 0,
    });
  });

  it('keeps the payments-due section alive when only one entity call fails', () => {
    const result = mergeCustomerDashboard([
      ok('paymentsDueJODL', { entities: [] }),
      failed('paymentsDueJOPL', 400, 'Missing required request parameter: applicationName'),
    ]);

    expect(result.paymentsDue?.success).toBe(true);
    expect(result.paymentsDue?.data?.entities.map((e) => e.code)).toEqual(['JODL']);
  });

  it('fails the payments-due section only when every entity call fails', () => {
    const result = mergeCustomerDashboard([
      failed('paymentsDueJODL', 400, 'Bad Request'),
      failed('paymentsDueJOPL', 400, 'Bad Request'),
    ]);

    expect(result.paymentsDue).toEqual({
      success: false,
      error: 'Bad Request',
      httpStatus: 400,
    });
  });
});

describe('payments-due request transformers', () => {
  const request = () => ({
    url: new URL('https://host/customer/payment/v2/payment-due'),
    headers: {},
    body: { gstin: '27AADCL2102L1ZQ' },
  });

  it('scopes the call to JODL and moves body params onto the query string', () => {
    const transformed = transformPaymentsDueJodlRequest(request());

    expect(transformed.url.searchParams.get('applicationName')).toBe('JODL');
    expect(transformed.url.searchParams.get('gstin')).toBe('27AADCL2102L1ZQ');
    expect(transformed.body).toBeNull();
  });

  it('scopes the call to JOPL', () => {
    expect(transformPaymentsDueJoplRequest(request()).url.searchParams.get('applicationName')).toBe(
      'JOPL',
    );
  });

  it('ignores a caller-supplied applicationName', () => {
    const req = request();
    req.url.searchParams.set('applicationName', 'SOMETHING_ELSE');

    expect(transformPaymentsDueJodlRequest(req).url.searchParams.get('applicationName')).toBe(
      'JODL',
    );
  });
});

describe('transformCreditEligibilityRequest', () => {
  it('appends the gstin from the body as a path segment', () => {
    const request = {
      url: new URL('https://host/customer/credit-lead-generation/eligible'),
      headers: {},
      body: { gstin: '27AADCL2102L1ZQ' },
    };

    const transformed = transformCreditEligibilityRequest(request);

    expect(transformed.url.toString()).toBe(
      'https://host/customer/credit-lead-generation/eligible/27AADCL2102L1ZQ',
    );
    expect(transformed.body).toBeNull();
  });

  it('falls back to the gstin query param', () => {
    const request = {
      url: new URL('https://host/customer/credit-lead-generation/eligible?gstin=27AADCL2102L1ZQ'),
      headers: {},
    };

    expect(transformCreditEligibilityRequest(request).url.pathname).toBe(
      '/customer/credit-lead-generation/eligible/27AADCL2102L1ZQ',
    );
  });

  it('throws when no gstin is supplied', () => {
    const request = {
      url: new URL('https://host/customer/credit-lead-generation/eligible'),
      headers: {},
      body: {},
    };

    expect(() => transformCreditEligibilityRequest(request)).toThrow('gstin is required');
  });
});

describe('sections query param', () => {
  const allTargets = (): AggregatedResponse[] => [
    ok('orderSummary', orderSummaryPayload),
    ok('credit', { isCreditEligible: true, amount: 260500 }),
    ok('ledger', { updatedOn: '2026-08-20', entities: [] }),
    ok('paymentsDueJODL', { entities: [] }),
    ok('paymentsDueJOPL', { entities: [] }),
  ];

  const request = () => ({
    url: new URL('https://host/customer/dashboard'),
    headers: {},
    body: { gstin: '27AADCL2102L1ZQ' },
  });

  it('returns every section when the param is absent', () => {
    const result = withQuery({}, () => mergeCustomerDashboard(allTargets()));

    expect(Object.keys(result)).toEqual(['orderSummary', 'credit', 'ledger', 'paymentsDue']);
  });

  it('returns only the requested sections, in canonical order', () => {
    const result = withQuery({ sections: 'paymentsDue,credit' }, () =>
      mergeCustomerDashboard(allTargets()),
    );

    expect(Object.keys(result)).toEqual(['credit', 'paymentsDue']);
    expect(result.credit?.data).toEqual({ isCreditEligible: true, amount: 260500 });
  });

  it('accepts a repeated param and ignores case', () => {
    const result = withQuery({ sections: ['LEDGER', 'ordersummary'] }, () =>
      mergeCustomerDashboard(allTargets()),
    );

    expect(Object.keys(result)).toEqual(['orderSummary', 'ledger']);
  });

  it('rejects an unknown section with a 400', () => {
    expect(() =>
      withQuery({ sections: 'credit,invoices' }, () => mergeCustomerDashboard(allTargets())),
    ).toThrow(/Unknown sections value\(s\): invoices/);

    try {
      withQuery({ sections: 'invoices' }, () => mergeCustomerDashboard(allTargets()));
    } catch (error: any) {
      expect(error.httpStatusCode).toBe(400);
    }
  });

  it('skips the downstream call for every unrequested section', () => {
    const selection = { sections: 'credit' };

    expect(withQuery(selection, () => transformOrderSummaryRequest(request())).skip).toBe(true);
    expect(withQuery(selection, () => transformLedgerRequest(request())).skip).toBe(true);
    expect(withQuery(selection, () => transformPaymentsDueJodlRequest(request())).skip).toBe(true);
    expect(withQuery(selection, () => transformPaymentsDueJoplRequest(request())).skip).toBe(true);

    const credit = withQuery(selection, () => transformCreditEligibilityRequest(request()));
    expect(credit.skip).toBeUndefined();
    expect(credit.url.pathname).toBe('/customer/dashboard/27AADCL2102L1ZQ');
  });

  it('skips a requested section that would otherwise fail validation only when unselected', () => {
    // credit unselected: no gstin needed, the call is simply skipped
    const skipped = withQuery({ sections: 'ledger' }, () =>
      transformCreditEligibilityRequest({ ...request(), body: {} }),
    );

    expect(skipped.skip).toBe(true);
  });

  it('skips every downstream call when the selection is invalid', () => {
    const selection = { sections: 'invoices' };

    expect(withQuery(selection, () => transformOrderSummaryRequest(request())).skip).toBe(true);
    expect(withQuery(selection, () => transformCreditEligibilityRequest(request())).skip).toBe(
      true,
    );
  });

  it('still applies the normal transform when the section is selected', () => {
    const transformed = withQuery({ sections: 'orderSummary,paymentsDue' }, () =>
      transformOrderSummaryRequest(request()),
    );

    expect(transformed.skip).toBeUndefined();
    expect(transformed.url.searchParams.get('gstin')).toBe('27AADCL2102L1ZQ');
  });
});
