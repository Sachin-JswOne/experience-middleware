/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Logger } from '@nestjs/common';
import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { safeDebug } from 'src/utils/common-functions.util';

/**
 * Extract categoryId values from web_central_catalogue_categories
 */
function extractCategoryIds(items: any[]): string[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => item?.categoryId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/**
 * TRANSFORMER 1
 * Builds the CCA request body using Strapi app-home-page response
 */
export function transformCcaRequest(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  const strapiResponse = prevResponses.find(
    (r) => r.target === 'strapi-category-ids',
  );

  safeDebug(
    Logger,
    () =>
      `Strapi Response (transformCcaRequest): ${JSON.stringify(
        strapiResponse,
      )}`,
  );

  let categoryIds: string[] = [];

  try {
    const blocks = strapiResponse?.data?.data?.blocks ?? [];

    for (const block of blocks) {
      /**
       * Case 1: app-category-component
       */
      if (
        block.__component === 'app-components.app-category-component' &&
        Array.isArray(block.web_central_catalogue_categories)
      ) {
        categoryIds.push(
          ...extractCategoryIds(block.web_central_catalogue_categories),
        );
      }
    }
  } catch (error) {
    Logger.warn(
      `transformCcaRequest: Error extracting categoryIds: ${error}`,
    );
  }

  /**
   * Remove duplicates
   */
  categoryIds = Array.from(new Set(categoryIds));

  safeDebug(
    Logger,
    () =>
      `Final category IDs (transformCcaRequest): ${JSON.stringify(
        categoryIds,
      )}`,
  );
  console.log("categoryIds", categoryIds);
  return {
    ...request,
    body: {
      categoryIds,
    },
  };
}

/**
 * TRANSFORMER 2
 * Returns the CCA category tree response as the final aggregated response
 */
export function mergeCategoryResponses(
  results: AggregatedResponse[],
): any {
  const strapiResult = results.find(
    (r) => r.target === 'strapi-category-ids',
  );

  const ccaResult = results.find(
    (r) =>
      r.target === 'central-catalogue-category-tree-list',
  );

  safeDebug(
    Logger,
    () =>
      `Strapi Result (mergeCategoryResponses): ${JSON.stringify(
        strapiResult,
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      `CCA Result (mergeCategoryResponses): ${JSON.stringify(
        ccaResult,
      )}`,
  );

  if (!strapiResult?.success) {
    Logger.error(
      `mergeCategoryResponses: Strapi fetch failed`,
    );
    return (
      strapiResult?.error || {
        error: 'Strapi categories fetch failed',
      }
    );
  }

  if (!ccaResult?.success) {
    Logger.error(
      `mergeCategoryResponses: CCA fetch failed`,
    );
    return (
      ccaResult?.error || {
        error: 'CCA categories fetch failed',
      }
    );
  }
  console.log("ccaResult?.data", ccaResult?.data.data.navigation[0].subMenu);

  /**
   * Returning both results (can be adapted if only CCA response is needed)
   */
  return ccaResult?.data;
}
