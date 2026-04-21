import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { CustomError } from 'src/utils/CustomError';

type JwtPayload = {
  sfCustomerId?: string;
  userId?: string;
};

function getBearerToken(headers?: Record<string, any>): string | null {
  const authHeader =
    headers?.authorization ??
    headers?.Authorization ??
    headers?.access_token ??
    headers?.Access_Token;

  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
}

function getSfAccountIdFromHeaders(headers?: Record<string, any>): string | null {
  try {
    const token = getBearerToken(headers);
    if (!token) return null;

    const decoded = jwt.decode(token) as JwtPayload | null;
    return decoded?.sfCustomerId ?? null;
  } catch {
    Logger.warn(`[one-helix] Failed to decode JWT for sfCustomerId`);
    return null;
  }
}

function formatActivityDatePlusOne(): string {
  const now = new Date();

  const indiaNow = new Date(
    now.toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata',
    }),
  );

  indiaNow.setDate(indiaNow.getDate() + 1);

  const year = indiaNow.getFullYear();
  const month = String(indiaNow.getMonth() + 1).padStart(2, '0');
  const day = String(indiaNow.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function selectOneHelixTarget(req: any): string {
  const authHeader =
    req?.headers?.authorization ||
    req?.headers?.Authorization ||
    req?.headers?.access_token ||
    req?.headers?.Access_Token;

  return authHeader ? 'one-helix-logged-in' : 'one-helix-guest';
}

export function transformOneHelixConsentRequest(request: BaseRequest): BaseRequest {
  const body = request.body ?? {};

  if (!body.mobile || typeof body.mobile !== 'string') {
    throw new CustomError('mobile is required', 400);
  }

  if (!body.customerConsent) {
    throw new CustomError('customerConsent is required for guest users', 400);
  }

  const transformedRequest: BaseRequest = {
    ...request,
    body: {
      fullName: body.fullName ?? '',
      registeredMobile: body.mobile,
      email: body.email ?? '',
      userType: body.userType ?? '',
      pincode: body.pincode ?? '',
      customerConsent: body.customerConsent,
    },
    headers: {
      ...request.headers,
    },
  };

  return transformedRequest;
}

/**
 * Logged-in flow:
 * directly build SF task payload by decoding sfCustomerId from JWT
 */
export function transformLoggedInOneHelixTaskRequest(request: BaseRequest): BaseRequest {
  const body = request.body ?? {};
  const sfAccountId = getSfAccountIdFromHeaders(request.headers as Record<string, any>);

  if (!sfAccountId) {
    throw new CustomError('Unable to extract sfAccountId from JWT', 400);
  }

  const userType = body.userType ?? '';
  const pincode = body.pincode ?? '';

  return {
    ...request,
    body: {
      RecordTypeId: process.env.SF_TASK_RECORD_TYPE_ID,
      OwnerId: process.env.SF_TASK_OWNER_ID,
      WhatId: sfAccountId,
      Subject: 'One Helix Task',
      ActivityDate: formatActivityDatePlusOne(),
      Description: `Enquiry for One Helix products. Customer type: ${userType}, Pincode: ${pincode}`,
    },
    headers: {
      ...request.headers,
    },
  };
}

/**
 * Guest flow:
 * consent response -> SF task payload
 */
export function transformGuestOneHelixTaskRequest(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {
  const body = request.body ?? {};
  const consentResponse = prevResponses?.find((r) => r.target === 'one-helix-consent');

  if (!consentResponse?.success) {
    throw new CustomError('Consent API failed for guest user', 500);
  }
  const sfAccountId = consentResponse.data?.data?.recordId;
  if (!sfAccountId || typeof sfAccountId !== 'string') {
    throw new CustomError('recordId missing in consent response', 500);
  }

  const userType = body.userType ?? '';
  const pincode = body.pincode ?? '';

  return {
    ...request,
    body: {
      RecordTypeId: process.env.SF_TASK_RECORD_TYPE_ID,
      OwnerId: process.env.SF_TASK_OWNER_ID,
      WhatId: sfAccountId,
      Subject: 'One Helix Task',
      ActivityDate: formatActivityDatePlusOne(),
      Description: `Enquiry for One Helix products. Customer type: ${userType}, Pincode: ${pincode}`,
    },
    headers: {
      ...request.headers,
    },
  };
}

export function pickOneHelixFinalResponse(
  aggregatedResponses: AggregatedResponse[],
): Record<string, any> {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const consentResponse = responses['one-helix-consent'];
  const taskResponse = responses['one-helix-task'];

  if (consentResponse && !consentResponse.success) {
    throw new CustomError(
      consentResponse.error || 'Consent validation failed',
      consentResponse.httpStatus || 500,
    );
  }

  if (taskResponse && !taskResponse.success) {
    throw new CustomError(
      taskResponse.error || 'Task creation failed',
      taskResponse.httpStatus || 500,
    );
  }

  return {
    success: true,
    message: 'One Helix enquiry submitted successfully',
    data: {
      consent: consentResponse?.success ? consentResponse.data : null,
      task: taskResponse.data,
    },
  };
}