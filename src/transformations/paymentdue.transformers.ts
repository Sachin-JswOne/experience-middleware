/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */

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
): TransformedPaymentDueResponse | any {
  safeDebug(
    Logger,
    () =>
      `Payment Due API → transform: getPaymentDueDetails → raw response: ${JSON.stringify(
        response.data,
      )}`,
  );

  try {
    const apiData = response?.data;

    if (!apiData) {
      return {
        success: false,
        error: 'Missing data from Payment Due API',
        httpStatus: response?.status,
      };
    }

    // Deep clone
    const cloned: PaymentDueApiResponse = JSON.parse(JSON.stringify(apiData));

    return {
      totalDue: cloned.totalDueAmount,
      dueLater: cloned.dueLaterAmount,
      todayDue: cloned.todayDueAmount,
      overdue: {
        status: cloned.paymentOverDueResponse.dueStatusDays,
        amount: cloned.paymentOverDueResponse.overdueAmount,
      },
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
