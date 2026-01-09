import { Logger } from '@nestjs/common';
import { BaseRequest } from '../models/base-request.model';
import { AggregatedResponse } from '../models/aggregated-response.model';

/**
 * Extracts all central catalogue category IDs from all blocks that contain them.
 */
export function getAllCentralCatalogueCategoryIds(blocks: any[]): string[] {
    // Extract from blocks with web_central_catalogue_categories (array)
    const categoryIdsFromArray = blocks
        .filter((b: any) => Array.isArray(b.web_central_catalogue_categories))
        .flatMap((b: any) => b.web_central_catalogue_categories.map((c: any) => c.categoryId))
        .filter(Boolean);

    // Extract from blocks with web_central_catalogue_category (single object) - e.g., app-top-brands
    const categoryIdsFromObject = blocks
        .filter((b: any) => b.web_central_catalogue_category?.categoryId)
        .map((b: any) => b.web_central_catalogue_category.categoryId)
        .filter(Boolean);

    // Combine and return unique IDs
    return [...new Set([...categoryIdsFromArray, ...categoryIdsFromObject])];
}

/**
 * Extracts central catalogue category IDs from the CMS home page response.
 * This is used to fetch navigation data for categories.
 */
export function extractCentralCatalogueCategoryIds(
    request: BaseRequest,
    prevResponses?: AggregatedResponse[],
): BaseRequest {
    if (!prevResponses || prevResponses.length === 0) {
        Logger.warn(`No previous responses available`);
        return request;
    }

    const cmsResponse = prevResponses.find(
        (r) => r.target === 'app-home-page',
    );

    if (!cmsResponse?.success) {
        Logger.warn(`CMS response missing or failed`);
        return request;
    }

    const blocks = cmsResponse.data?.data?.blocks ?? [];
    const categoryIds = getAllCentralCatalogueCategoryIds(blocks);

    if (categoryIds.length === 0) {
        Logger.warn(`No central catalogue category IDs found in any blocks`);
        return request;
    }

    return {
        ...request,
        body: {
            categoryIds,
        },
    };
}

export function extractBrandCategoryIds(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {

  if (!prevResponses || prevResponses.length === 0) {
    // Return request with empty body array to avoid invalid API calls
    return {
      ...request,
      body: {
        brandCategoryIds: [],
      },
    };
  }
  const cmsResponse = prevResponses.find((r) => r.target === 'app-home-page');

  if (!cmsResponse) {
    Logger.warn(
      `[extractBrandCategoryIds] CMS response not found in prevResponses. Available targets: ${prevResponses.map((r) => r.target).join(', ')}`,
    );
    return {
      ...request,
      body: {
        brandCategoryIds: [],
      },
    };
  }

  const blocks = cmsResponse.data?.data?.blocks ?? [];

  // Extract category IDs from web_central_catalogue_categories array in app-top-brands blocks
  const brandCategoryIds = blocks
    .filter(
      (b: any) =>
        b.__component === 'app-components.app-top-brands' &&
        Array.isArray(b.web_central_catalogue_categories) &&
        b.web_central_catalogue_categories.length > 0,
    )
    .flatMap((b: any) =>
      b.web_central_catalogue_categories.map((c: any) => c.categoryId).filter(Boolean),
    );

  Logger.log(
    `[extractBrandCategoryIds] Extracted ${brandCategoryIds.length} brand category IDs: ${JSON.stringify(brandCategoryIds)}`,
  );

  if (brandCategoryIds.length === 0) {
    const topBrandBlocks = blocks.filter(
      (b: any) => b.__component === 'app-components.app-top-brands',
    );
    const blocksWithCategories = topBrandBlocks.filter(
      (b: any) =>
        Array.isArray(b.web_central_catalogue_categories) &&
        b.web_central_catalogue_categories.length > 0,
    );
    Logger.warn(
      `[extractBrandCategoryIds] No categoryId found in top-brand component. Total app-top-brands blocks: ${topBrandBlocks.length}, Blocks with web_central_catalogue_categories: ${blocksWithCategories.length}`,
    );
    // Return with empty array to make API call with valid structure
    return {
      ...request,
      body: {
        brandCategoryIds: [],
      },
    };
  }

  return {
    ...request,
    body: {
      brandCategoryIds,
    },
  };
}
