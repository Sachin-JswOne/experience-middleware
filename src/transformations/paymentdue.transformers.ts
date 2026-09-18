import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';
import { AxiosResponse } from 'axios';
import { CustomError } from 'src/utils/CustomError';
import { AggregatedResponse } from 'src/models/aggregated-response.model';

interface AmountDetails {
  centAmount: number;
  currency: string;
  displayAmount: string | null;
  absoluteDisplayAmount: string | null;
  precisionAmount: number;
  precision: number;
}

interface PaymentOverDueResponse {
  dueStatusDays: string;
  overdueAmount: AmountDetails;
}

interface PaymentDueApiResponse {
  totalDueAmount: AmountDetails;
  dueLaterAmount: AmountDetails;
  todayDueAmount: AmountDetails;
  paymentOverDueResponse: PaymentOverDueResponse;
}

interface TransformedPaymentDueResponse {
  totalDue: AmountDetails;
  dueLater: AmountDetails;
  todayDue: AmountDetails;
  overdue: {
    status: string;
    amount: AmountDetails;
  };
}

export function getPaymentDueDetails(
  response: AxiosResponse<{ data: PaymentDueApiResponse; success: boolean }>,
): TransformedPaymentDueResponse | any {
  safeDebug(
    Logger,
    () =>
      `Payment Due API → transform: getPaymentDueDetails → raw response: ${JSON.stringify(
        response.data,
      )}`,
  );

  try {
    const data = response?.data;

    if (!data) {
      return {
        success: false,
        error: 'Missing data from Payment Due API',
        httpStatus: response?.status,
      };
    }

    return {
      ...data,
    };
  } catch (error) {
    return {
      success: false,
      error: 'Failed to transform Payment Due API response',
      exception: (error as Error)?.message,
      httpStatus: response?.status,
    };
  }
}

export function transformOrdersPendingPaymentsRequest(request): any {
  const gstin = request.url.searchParams.get('gstin');

  request.url.searchParams.set('gstin', gstin);
  return request;
}

export function transformAccountDetailsRequest(request) {
  const gstin = request.url.searchParams.get('gstin');

  request.url.searchParams.set('gstin', gstin);
  return request;
}

export function mergePaymentDueAndAccountDetails(aggregatedResponses: AggregatedResponse[]) {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
  const paymentDueResult = responses['orders-pending-payments']?.data;
  const accountDetailsResult = responses['account-details']?.data;
  if (paymentDueResult?.responseCode !== '200') {
    throw new CustomError(`Fetch payments due ERP APIs failed`, 400);
  }

  const data = paymentDueResult?.data;
  if (data) {
    return {
      paymentDueDetails: {
        totalAmountDue: 0.0,
        netPaymentDue: roundUp(data?.netPaymentDue, 2) || 0,
        accountDetails: getCustomerDetails(accountDetailsResult),
        totalPaymentDue: roundUp(data?.totalPaymentDue, 2) || 0,
        overDueAmount: roundUp(data?.paymentOverDueDetails.overDueAmount, 2) || 0,
        dueStatus: data?.paymentOverDueDetails.dueStatusDays,
        dueToday: roundUp(data?.dueToday, 2) || 0,
        dueLaterAmount: roundUp(data.dueLaterAmount, 2) || 0,
        listOfOrderDues: [],
      },
    };
  } else throw new CustomError('No details found', 404);
}

export function roundUp(number: number, decimalPlaces: number): number {
  const multiplier = Math.pow(10, decimalPlaces);
  const roundedNumber = Math.ceil(number * multiplier) / multiplier;

  const integerPart = Math.floor(roundedNumber);
  const fractionalPart = roundedNumber - integerPart;

  if (fractionalPart === 0) {
    return integerPart;
  } else {
    return parseFloat(roundedNumber.toFixed(decimalPlaces));
  }
}

export function getCustomerDetails(accountDetailsResult) {
  const customerDetails = accountDetailsResult;
  const customerBankDetail = customerDetails?.data.customerDetails;
  if (
    customerDetails?.data === undefined ||
    customerDetails?.data === null ||
    customerDetails.responseCode != 200
  ) {
    safeDebug(
      Logger,
      () => `Payment Due API → Error from SF call: ${JSON.stringify(customerDetails.error)}`,
    );
    return {
      beneficiaryName: '',
      accountNumber: '',
      IFSCCode: '',
      bankName: '',
    };
  } else {
    if (customerBankDetail[0]?.payTo === 'JOPL Nodal' || customerBankDetail[0]?.payTo === null) {
      return {
        beneficiaryName: customerBankDetail[0]?.nodalBeneficiaryName ?? '',
        accountNumber: customerBankDetail[0]?.nodalVanId ?? '',
        IFSCCode: customerBankDetail[0]?.nodalIfscCode ?? '',
        bankName: customerBankDetail[0]?.nodalBankName ?? '',
      };
    } else if (customerBankDetail[0]?.payTo === 'JODL')
      return {
        beneficiaryName: customerBankDetail[0]?.nonNodalBeneficiaryName ?? '',
        accountNumber: customerBankDetail[0]?.nonNodalVanId ?? '',
        IFSCCode: customerBankDetail[0]?.nonNodalIfscCode ?? '',
        bankName: customerBankDetail[0]?.nonNodalBankName ?? '',
      };
  }
}

export function transformOrderSummaryRequest(request) {
  const orderNumber = request.url.searchParams.get('orderNumber');
  request.url.searchParams.set('orderNumber', orderNumber);
  return request;
}
