import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';
import { AxiosResponse } from 'axios';

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
): TransformedPaymentDueResponse | unknown{
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
