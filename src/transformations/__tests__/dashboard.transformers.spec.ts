import {
  mergeCustomerDashboard,
  transformCreditDetailsRequest,
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

/** Platform AmountDetails object; `centAmount` is in hundredths of a rupee. */
const amount = (centAmount: number) => ({
  centAmount,
  currency: 'INR',
  precisionAmount: centAmount * 1000,
  precision: 5,
});

/** Lead-generation payload for a customer who already holds credit. */
const hasCreditLead = {
  customerCreditLead: {
    gst: '27AADCL2102L1ZQ',
    creditAmount: '₹25 Lakhs to ₹50 Lakhs',
    createdAt: '30-01-2026 10:34',
    sfCustomerId: '001Ik000008lN7GIAU',
    creditLeadSubmitted: true,
  },
  message: 'Customer Credit lead is present',
  isCreditLeadGenerationEligible: false,
};

/** Lead-generation payload for a customer who can apply but holds no credit yet. */
const canApplyForCredit = {
  customerCreditLead: null,
  message: 'Customer is eligible for credit lead generation',
  isCreditLeadGenerationEligible: true,
};

/** One row of the credit-limits list, in the shape the creditDetails API returns. */
const creditLimit = (creditUsable: number, extra: Record<string, any> = {}) => ({
  creditProduct: 'BNPL',
  creditSanctioned: amount(creditUsable * 2),
  creditUsable: amount(creditUsable),
  visibleToCustomer: true,
  ...extra,
});

/** Two limits totalling 2,60,500.00 usable credit. */
const creditDetailsPayload = {
  status: 'OK',
  data: [creditLimit(20000000), creditLimit(6050000)],
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
      ok('credit', hasCreditLead),
      ok('creditDetails', creditDetailsPayload),
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
      // Holding credit ends eligibility, so the flag reads false beside a real amount.
      data: { isCreditEligible: false, amount: 260500 },
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
      ok('creditDetails', creditDetailsPayload),
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

  it('sums the usable credit across every limit when the customer holds credit', () => {
    const result = mergeCustomerDashboard([
      ok('credit', hasCreditLead),
      ok('creditDetails', {
        status: 'OK',
        data: [
          creditLimit(1221341400, { creditProduct: 'Letter of credit' }),
          creditLimit(62839987),
        ],
        error: null,
        success: true,
      }),
    ]);

    // 1,22,13,414.00 + 6,28,399.87
    expect(result.credit).toEqual({
      success: true,
      data: { isCreditEligible: false, amount: 12841813.87 },
    });
  });

  it('reports an applicable customer as eligible with no amount', () => {
    // No creditDetails response at all: a customer who can only apply must not
    // have their card failed by a limits call they have no limits for.
    const result = mergeCustomerDashboard([ok('credit', canApplyForCredit)]);

    expect(result.credit).toEqual({
      success: true,
      data: { isCreditEligible: true, amount: 0 },
    });
  });

  it('reports a customer who can neither apply nor holds credit', () => {
    const result = mergeCustomerDashboard([
      ok('credit', { customerCreditLead: null, isCreditLeadGenerationEligible: false }),
    ]);

    expect(result.credit?.data).toEqual({ isCreditEligible: false, amount: 0 });
  });

  it('leaves limits hidden from the customer out of the credit total', () => {
    const result = mergeCustomerDashboard([
      ok('credit', hasCreditLead),
      ok('creditDetails', {
        data: [creditLimit(20000000), creditLimit(6050000, { visibleToCustomer: false })],
        success: true,
      }),
    ]);

    expect(result.credit?.data).toEqual({ isCreditEligible: false, amount: 200000 });
  });

  it('fails the credit section when the limits call fails for a customer with credit', () => {
    const result = mergeCustomerDashboard([
      ok('credit', hasCreditLead),
      failed('creditDetails', 502, 'Bad Gateway'),
    ]);

    expect(result.credit).toEqual({
      success: false,
      error: 'Bad Gateway',
      httpStatus: 502,
    });
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

  it('reads centAmount in hundredths regardless of the precision field', () => {
    const result = mergeCustomerDashboard([
      ok('ledger', {
        updatedOn: '2026-08-20',
        entities: [
          {
            code: 'JODL',
            amount: {
              centAmount: 70084013,
              currency: 'INR',
              displayAmount: '7,00,840.13',
              precisionAmount: 70084013000,
              precision: 5,
            },
          },
        ],
      }),
    ]);

    expect(result.ledger?.data?.entities[0].amount).toBe(700840.13);
  });

  it('maps the transaction-type-keyed ledger payload onto legal entities', () => {
    const result = mergeCustomerDashboard([
      ok('ledger', {
        NODAL: {
          totalOrderBlockAmount: amount(106637297),
          usableLedgerBalance: amount(9993428990102),
          ledgerBalance: amount(9993535627399),
        },
        NON_NODAL: {
          totalOrderBlockAmount: amount(70084013),
          usableLedgerBalance: amount(9993465543386),
          ledgerBalance: amount(9993535627399),
        },
      }),
    ]);

    // NON_NODAL is JODL and sorts first, matching the payments-due entity order.
    expect(result.ledger?.data?.entities).toEqual([
      {
        code: 'JODL',
        name: 'JSW One Distribution Limited',
        amount: 99935356273.99,
        usableAmount: 99934655433.86,
        blockedAmount: 700840.13,
      },
      {
        code: 'JOPL',
        name: 'JSW One Platforms Limited',
        amount: 99935356273.99,
        usableAmount: 99934289901.02,
        blockedAmount: 1066372.97,
      },
    ]);
  });

  it('derives the usable balance when the downstream sends only the gross one', () => {
    const result = mergeCustomerDashboard([
      ok('ledger', {
        updatedOn: '2026-08-20',
        entities: [{ code: 'JOPL', ledgerBalance: 2260500, totalOrderBlockAmount: 60500 }],
      }),
    ]);

    expect(result.ledger?.data?.entities[0]).toEqual({
      code: 'JOPL',
      name: 'JSW One Platforms Limited',
      amount: 2260500,
      usableAmount: 2200000,
      blockedAmount: 60500,
    });
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

describe('transformCreditDetailsRequest', () => {
  const request = () => ({
    url: new URL('https://host/customer/ledger/v2/creditDetails'),
    headers: {},
    body: { gstin: '27AADCL2102L1ZQ' },
  });

  it('moves body params onto the query string', () => {
    const transformed = transformCreditDetailsRequest(request());

    expect(transformed.url.searchParams.get('gstin')).toBe('27AADCL2102L1ZQ');
    expect(transformed.body).toBeNull();
  });

  it('is skipped along with the rest of the credit section', () => {
    expect(
      withQuery({ sections: 'ledger' }, () => transformCreditDetailsRequest(request())).skip,
    ).toBe(true);
  });
});

describe('sections query param', () => {
  const allTargets = (): AggregatedResponse[] => [
    ok('orderSummary', orderSummaryPayload),
    ok('credit', hasCreditLead),
    ok('creditDetails', creditDetailsPayload),
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
    expect(result.credit?.data).toEqual({ isCreditEligible: false, amount: 260500 });
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
