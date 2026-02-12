import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug, safeToLog } from 'src/utils/common-functions.util';

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

  const profile =
 
    profileResp && profileResp.data && typeof profileResp.data === 'object'
      ? profileResp.data
      : {
          success: false,
          error: profileResp.error || 'Unknown error',
          httpStatus: profileResp.httpStatus,
        };

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
    profile: { ...profile, mouEligibilityPayload },
    customerData,
    ...gstData,
  };
}
