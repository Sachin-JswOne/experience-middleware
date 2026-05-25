import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug, safeToLog } from 'src/utils/common-functions.util';
import { CustomError } from 'src/utils/CustomError';
import { BaseRequest } from 'src/models/base-request.model';

/**
 * Transforms aggregated customer profile responses to ensure they are JSON-serializable
 * and removes any circular references by deep cloning the data
 * Returns a structured object with meaningful keys: profile and customerData
 */
export function transformCustomerProfileResponses(aggregatedResponses: AggregatedResponse[]): any {
  safeDebug(
    Logger,
    () =>
      ` Customer Profile Api response from method: transformCustomerProfileResponses : ${JSON.stringify(
        aggregatedResponses,
      )}`,
  );
  const result: any = {};

  aggregatedResponses.forEach((response) => {
    // Use the target name directly as the key
    const key = response.target;

    // Only include data if it exists and is serializable
    if (response.success && response.data !== undefined) {
      try {
        // Deep clone by stringifying and parsing to remove circular references
        result[key] = JSON.parse(JSON.stringify(response.data));
      } catch {
        // If there's a circular reference or other serialization issue, return null
        result[key] = {
          error: 'Response data could not be serialized',
          data: null,
        };
      }
    } else {
      // Include error information if request failed
      result[key] = {
        success: false,
        error: response.error || 'Unknown error',
        httpStatus: response.httpStatus,
      };

      if (response.downstreamResponse !== undefined) {
        try {
          result[key].downstreamResponse = JSON.parse(JSON.stringify(response.downstreamResponse));
        } catch {
          result[key].downstreamResponse = null;
        }
      }
    }
  });

  return result;
}

function extractGstinFromProfile(profileData: any): string | undefined {
  return (
    profileData?.gstin ||
    profileData?.data?.gstin ||
    profileData?.data?.data?.gstin ||
    profileData?.customer?.gstin ||
    profileData?.customerProfile?.gstin
  );
}

export function injectGstinFromProfile(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  const profileResp = prevResponses?.find((r) => r.target === 'profile');

  const gstin = extractGstinFromProfile(profileResp?.data);

  if (!gstin) {
    throw new CustomError('Bad Request: gstin not found in profile response', 400);
  }

  request.url.searchParams.set('gstin', gstin);
  return request;
}

export function mergeCustomerProfile(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const profileResp = responses['profile'];
  const mouResp = responses['mou-eligibility'];
  const profileV2Resp = responses['customerData'];
  const gstResp = responses['gstin-customer-profile'];
  const transactingResp = responses['transacting'];

  safeDebug(
    Logger,
    () => `Transacting response from mergeCustomerProfile: ${safeToLog(transactingResp)}`,
  );

  safeDebug(
    Logger,
    () => `Customer profile response from mergeCustomerProfile: ${safeToLog(profileResp)}`,
  );

  safeDebug(
    Logger,
    () => `Customer profile response v2 from mergeCustomerProfile: ${safeToLog(profileV2Resp)}`,
  );

  safeDebug(
    Logger,
    () => `MOU eligibility response from mergeCustomerProfile: ${safeToLog(mouResp)}`,
  );

  safeDebug(
    Logger,
    () => `GstIn Customer data response from mergeCustomerProfile: ${safeToLog(gstResp)}`,
  );

  safeDebug(
    Logger,
    () => `GstIn Customer data response from mergeCustomerProfile: ${safeToLog(gstResp)}`,
  );

  const profile =
    profileResp && profileResp.data && typeof profileResp.data === 'object'
      ? profileResp.data
      : {
          success: false,
          error: profileResp.error || 'Unknown error',
          httpStatus: profileResp.httpStatus,
        };
  const isTransacting = transactingResp?.data.data ?? false;

  const customerData =
    profileV2Resp && profileV2Resp.data && typeof profileV2Resp.data === 'object'
      ? profileV2Resp.data
      : {
          success: false,
          error: profileV2Resp.error || 'Unknown error',
          httpStatus: profileV2Resp.httpStatus,
        };

  const mouEligibilityPayload =
    mouResp && mouResp.data && typeof mouResp.data === 'object' ? (mouResp.data as any) : {};

  const gstPayload =
    gstResp && gstResp.data && typeof gstResp.data === 'object' ? (gstResp.data as any) : null;

  const gstData =
    gstPayload && typeof gstPayload.data === 'object' && gstPayload.data !== null
      ? gstPayload.data
      : {};

  return {
    profile: { ...profile, mouEligibilityPayload, isTransacting },
    customerData,
    ...gstData,
  };
}

export function transformFetchUserRequest(request: BaseRequest): BaseRequest {
  const email = request.url.searchParams.get('email')?.trim();
  const phoneNumber = request.url.searchParams.get('phoneNumber')?.trim();

  const contactSfId = request.url.searchParams.get('contactSfId')?.trim();

  const providedParams = [email, phoneNumber, contactSfId].filter(Boolean);

  const hasAccessToken =
    Boolean(request.headers?.access_token) ||
    Boolean(request.headers?.Access_Token) ||
    Boolean(request.headers?.authorization) ||
    Boolean(request.headers?.Authorization);

  if (providedParams.length > 1) {
    throw new CustomError(
      'Exactly one of email, phoneNumber, or contactSfId must be provided.',
      400,
    );
  }

  if (!hasAccessToken && providedParams.length !== 1) {
    throw new CustomError(
      'Exactly one of email, phoneNumber, or contactSfId must be provided.',
      400,
    );
  }

  const includePermission =
    request.url.searchParams.get('includePermission')?.toLowerCase() === 'true';

  request.url.searchParams.delete('email');
  request.url.searchParams.delete('phoneNumber');
  request.url.searchParams.delete('contactSfId');
  request.url.searchParams.delete('includePermission');

  if (email) request.url.searchParams.set('email', email);
  if (phoneNumber) request.url.searchParams.set('phoneNumber', phoneNumber);
  if (contactSfId) request.url.searchParams.set('contactSfId', contactSfId);

  // Default false, true only when explicitly true
  request.url.searchParams.set('includePermission', String(includePermission));

  const isInvitationAcceptanceFlow = Boolean(contactSfId) && !hasAccessToken;

  return addCustomerApiKeyIfNoAuth({
    ...request,
    body: undefined,
  });
}

export function addCustomerApiKeyIfNoAuth(request: BaseRequest): BaseRequest {
  const hasAccessToken =
    Boolean(request.headers?.access_token) ||
    Boolean(request.headers?.authorization) ||
    Boolean(request.headers?.Authorization);

  if (hasAccessToken) {
    return request;
  }

  return {
    ...request,
    headers: {
      ...request.headers,
      'X-API-KEY': process.env.CUSTOMER_SERVICE_X_API_KEY,
    },
  };
}