import {
  mergeCustomerDashboard,
  transformCreditEligibilityRequest,
} from '../dashboard.transformers';
import { AggregatedResponse } from 'src/models/aggregated-response.model';

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
      ok('paymentsDue', {
        entities: [
          {
            code: 'JODL',
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
    expect(result.ledger.data?.entities[1].name).toBe('JSW One Platforms Limited');
    expect(result.paymentsDue.data?.entities[0].buckets.overdue).toBe(1200000);
  });

  it('marks only the failing section when a target returns 401', () => {
    const result = mergeCustomerDashboard([
      ok('orderSummary', orderSummaryPayload),
      failed('credit', 401, 'Unauthorized'),
      ok('ledger', { updatedOn: '2026-08-20', entities: [] }),
      ok('paymentsDue', { entities: [] }),
    ]);

    expect(result.credit).toEqual({ success: false, error: 'Unauthorized', httpStatus: 401 });
    expect(result.orderSummary.success).toBe(true);
    expect(result.ledger.success).toBe(true);
    expect(result.paymentsDue.success).toBe(true);
  });

  it('marks a section unsuccessful when its target is missing from the aggregate', () => {
    const result = mergeCustomerDashboard([ok('orderSummary', orderSummaryPayload)]);

    expect(result.ledger).toEqual({ success: false, error: 'No response from ledger' });
    expect(result.paymentsDue.success).toBe(false);
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

    expect(result.orderSummary.data?.invoiceDetails.hasActiveOrder).toBe(false);
  });

  it('defaults missing amounts and counts to zero rather than undefined', () => {
    const result = mergeCustomerDashboard([ok('orderSummary', { data: {}, success: true })]);

    expect(result.orderSummary.data).toEqual({
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

    expect(result.ledger.data?.entities[0].amount).toBe(2260500);
  });

  it('groups a flat payments-due list into per-entity buckets', () => {
    const result = mergeCustomerDashboard([
      ok('paymentsDue', {
        dueList: [
          { entityCode: 'JODL', dueStatus: 'OVERDUE', amount: 1200000, dueDate: iso(-5) },
          { entityCode: 'JODL', dueStatus: 'Due Today', amount: 500000, dueDate: iso(0) },
          { entityCode: 'JODL', dueStatus: 'Material Dispatch', amount: 60500, dueDate: iso(2) },
          { entityCode: 'JODL', dueStatus: 'ORDER_CONFIRMATION', amount: 500000, dueDate: iso(10) },
          { entityCode: 'JOPL', dueStatus: 'OVERDUE', amount: 0, dueDate: iso(-1) },
        ],
      }),
    ]);

    const [jodl, jopl] = result.paymentsDue.data!.entities;
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
    expect(jopl.code).toBe('JOPL');
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
