/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';

/**
 * Transforms aggregated customer profile responses to ensure they are JSON-serializable
 * and removes any circular references by deep cloning the data
 * Returns a structured object with meaningful keys: profile and customerData
 */
export function transformCustomerProfileResponses(
  aggregatedResponses: AggregatedResponse[],
): any {
  safeDebug(Logger, () => ` Customer Profile Api response from method: transformCustomerProfileResponses : ${JSON.stringify(
    aggregatedResponses,
  )}`);
  const result: any = {};

  aggregatedResponses.forEach((response) => {
    // Use the target name directly as the key
    const key = response.target;

    // Only include data if it exists and is serializable
    if (response.success && response.data !== undefined) {
      try {
        // Deep clone by stringifying and parsing to remove circular references
        result[key] = JSON.parse(JSON.stringify(response.data));
      } catch (error) {
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
          result[key].downstreamResponse = JSON.parse(
            JSON.stringify(response.downstreamResponse),
          );
        } catch (error) {
          result[key].downstreamResponse = null;
        }
      }
    }
  });

  return result;
}
