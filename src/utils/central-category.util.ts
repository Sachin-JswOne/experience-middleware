import { Logger } from '@nestjs/common';
import { BaseRequest } from '../models/base-request.model';
import { AggregatedResponse } from '../models/aggregated-response.model';
import { CustomError } from './CustomError';

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
    ) ??
    prevResponses.find((r) => r.target === 'app-search-page');

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

/**
 * Extracts the category slug from app-product-category component.
 * Gets the first app_product_categories element and extracts the categorySlug
 * from the first web_central_catalogue_categories element.
 * Throws CustomError if no valid slug is found to prevent invalid API calls.
 */
export function extractProductListingSlug(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {
  Logger.log(
    `[extractProductListingSlug] Available headers: ${JSON.stringify(Object.keys(request.headers || {}))}`,
  );

  if (!prevResponses || prevResponses.length === 0) {
    Logger.warn(`[extractProductListingSlug] No previous responses available`);
    throw new CustomError(
      '[extractProductListingSlug] No previous responses available. Cannot extract product listing slug.',
      400,
    );
  }

  const cmsResponse = prevResponses.find((r) => r.target === 'app-home-page');

  if (!cmsResponse || !cmsResponse.success) {
    Logger.warn(
      `[extractProductListingSlug] CMS response not found or failed. Available targets: ${prevResponses.map((r) => r.target).join(', ')}`,
    );
    throw new CustomError(
      `[extractProductListingSlug] CMS response not found or failed. Cannot extract product listing slug.`,
      400,
    );
  }

  const blocks = cmsResponse.data?.data?.blocks ?? [];

  // Find app-product-category blocks
  const productCategoryBlocks = blocks.filter(
    (b: any) => b.__component === 'app-components.app-product-category',
  );

  if (productCategoryBlocks.length === 0) {
    Logger.warn(`[extractProductListingSlug] No app-product-category blocks found in CMS response`);
    throw new CustomError(
      '[extractProductListingSlug] No app-product-category blocks found. Cannot extract product listing slug.',
      400,
    );
  }

  // Get the first block and extract slug from first app_product_categories element
  const firstBlock = productCategoryBlocks[0];
  const firstProductCategory =
    Array.isArray(firstBlock.app_product_categories) && firstBlock.app_product_categories.length > 0
      ? firstBlock.app_product_categories[0]
      : null;

  if (!firstProductCategory) {
    Logger.warn(
      `[extractProductListingSlug] No app_product_categories found in first app-product-category block`,
    );
    throw new CustomError(
      '[extractProductListingSlug] No app_product_categories found. Cannot extract product listing slug.',
      400,
    );
  }

  const firstCentralCategory =
    Array.isArray(firstProductCategory.web_central_catalogue_categories) &&
    firstProductCategory.web_central_catalogue_categories.length > 0
      ? firstProductCategory.web_central_catalogue_categories[0]
      : null;

  if (!firstCentralCategory?.categorySlug) {
    Logger.warn(
      `[extractProductListingSlug] No categorySlug found in first web_central_catalogue_categories element`,
    );
    throw new CustomError(
      '[extractProductListingSlug] No categorySlug found in web_central_catalogue_categories. Cannot extract product listing slug.',
      400,
    );
  }

  const slug = firstCentralCategory.categorySlug;

  // Validate slug is not empty
  if (!slug || typeof slug !== 'string' || slug.trim() === '') {
    Logger.warn(`[extractProductListingSlug] Invalid or empty slug found: ${slug}`);
    throw new CustomError(
      '[extractProductListingSlug] Invalid or empty slug. Cannot process product listing request.',
      400,
    );
  }

  const trimmedSlug = slug.trim();

  const requestBody = {
    offSet: 0,
    limit: 21,
    slug: trimmedSlug,
    storefront: 'msme',
  };

  // Preserve headers from the original request
  const finalRequest = {
    ...request,
    body: requestBody,
    headers: {
      ...request.headers,
    },
  };

  return finalRequest;
}
