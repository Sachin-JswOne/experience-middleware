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

  const cmsResponse =
    prevResponses.find((r) => r.target === 'app-home-page') ??
    prevResponses.find((r) => r.target === 'app-search-page') ??
    prevResponses.find((r) => r.target === 'layout-landing-pages');

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

export function extractCentralCatalogueCategoryIdsv3(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {
  if (!prevResponses || prevResponses.length === 0) {
    Logger.warn(`[extractCentralCatalogueCategoryIdsv3] No previous responses available`);
    return {
      ...request,
      body: { categoryIds: [] },
    };
  }

  const cmsResponse =
    prevResponses.find((r) => r.target === 'layout-mweb-homepages') ??
    prevResponses.find((r) => r.target === 'app-home-page') ??
    prevResponses.find((r) => r.target === 'app-search-page') ??
    prevResponses.find((r) => r.target === 'layout-landing-pages');

  if (!cmsResponse) {
    Logger.warn(
      `[extractCentralCatalogueCategoryIdsv3] CMS response not found. Available targets: ${prevResponses
        .map((r) => r.target)
        .join(', ')}`,
    );
    return {
      ...request,
      body: { categoryIds: [] },
    };
  }

  if (!cmsResponse.success) {
    Logger.warn(`[extractCentralCatalogueCategoryIdsv3] CMS response failed`);
    return {
      ...request,
      body: { categoryIds: [] },
    };
  }

  let categoryIds: string[] = [];

  const cmsData = cmsResponse.data?.data;
  const firstPage = Array.isArray(cmsData) ? cmsData[0] : null;

  if (firstPage) {
    categoryIds = getAllCentralCatalogueCategoryIdsv3(firstPage);
  } else {
    // ---- fallback to old blocks style ----
    const blocks = cmsResponse.data?.data?.blocks ?? [];
    categoryIds = getAllCentralCatalogueCategoryIds(blocks);
  }

  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    Logger.warn(
      `[extractCentralCatalogueCategoryIdsv3] No central catalogue category IDs found (target=${cmsResponse.target})`,
    );
    return {
      ...request,
      body: { categoryIds: [] },
    };
  }

  return {
    ...request,
    body: { categoryIds },
    headers: { ...request.headers },
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

  if (!cmsResponse?.success) {
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

export function extractBrandCategoryIdsv3(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {
  if (!prevResponses || prevResponses.length === 0) {
    return {
      ...request,
      body: { brandCategoryIds: [] },
    };
  }

  // Prefer V3 CMS target first
  const cmsResponse =
    prevResponses.find((r) => r.target === 'layout-mweb-homepages') ??
    prevResponses.find((r) => r.target === 'app-home-page');

  if (!cmsResponse || !cmsResponse.success) {
    Logger.warn(
      `[extractBrandCategoryIdsv3] CMS response not found or failed. Available targets: ${prevResponses
        .map((r) => r.target)
        .join(', ')}`,
    );
    return {
      ...request,
      body: { brandCategoryIds: [] },
    };
  }

  const cmsData = cmsResponse.data?.data;
  const firstPage = Array.isArray(cmsData) ? cmsData[0] : null;

  let brandCategoryIds: string[] = [];

  if (firstPage?.top_brand_component) {
    const categories = firstPage.top_brand_component.web_central_catalogue_categories;

    if (Array.isArray(categories) && categories.length > 0) {
      brandCategoryIds = categories
        .map((c: any) => c?.categoryId)
        .filter((x: any) => typeof x === 'string' && x.trim() !== '')
        .map((x: string) => x.trim());
    }

    Logger.log(
      `[extractBrandCategoryIdsv3] (v3) Extracted ${brandCategoryIds.length} brand category IDs: ${JSON.stringify(
        brandCategoryIds,
      )}`,
    );

    return {
      ...request,
      body: { brandCategoryIds },
    };
  }

  const blocks = cmsResponse.data?.data?.blocks ?? [];

  brandCategoryIds = blocks
    .filter(
      (b: any) =>
        b.__component === 'app-components.app-top-brands' &&
        Array.isArray(b.web_central_catalogue_categories) &&
        b.web_central_catalogue_categories.length > 0,
    )
    .flatMap((b: any) =>
      b.web_central_catalogue_categories.map((c: any) => c?.categoryId).filter(Boolean),
    )
    .filter((x: any) => typeof x === 'string' && x.trim() !== '')
    .map((x: string) => x.trim());

  return {
    ...request,
    body: { brandCategoryIds },
  };
}

export function extractProductListingSlugv3(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {
  if (!prevResponses || prevResponses.length === 0) {
    Logger.warn(`[extractProductListingSlugv3] No previous responses available`);

    return {
      ...request,
      body: undefined,
    };
  }

  // Prefer V3 cms target
  const cmsResponse =
    prevResponses.find((r) => r.target === 'layout-mweb-homepages') ??
    prevResponses.find((r) => r.target === 'app-home-page') ??
    prevResponses.find((r) => r.target === 'layout-landing-pages');

  if (!cmsResponse || !cmsResponse.success) {
    Logger.warn(
      `[extractProductListingSlugv3] CMS response not found or failed. Available targets: ${prevResponses
        .map((r) => r.target)
        .join(', ')}`,
    );
    return {
      ...request,
      body: undefined,
    };
  }

  let slug: string | undefined;

  const cmsData = cmsResponse.data?.data;
  const firstPage = Array.isArray(cmsData) ? cmsData[0] : null;

  const productCategoryComponents = firstPage?.product_category_component;

  if (Array.isArray(productCategoryComponents) && productCategoryComponents.length > 0) {
    for (const comp of productCategoryComponents) {
      const categories = comp?.product_categories ?? comp?.app_product_categories ?? [];

      if (!Array.isArray(categories) || categories.length === 0) continue;

      for (const cat of categories) {
        const firstCentral =
          Array.isArray(cat?.web_central_catalogue_categories) &&
          cat.web_central_catalogue_categories.length > 0
            ? cat.web_central_catalogue_categories[0]
            : null;

        const candidate = firstCentral?.categorySlug;
        if (typeof candidate === 'string' && candidate.trim()) {
          slug = candidate.trim();
          break;
        }
      }

      if (slug) break;
    }
  }
  const genericBlocks = firstPage?.genericPage ?? [];

  if (Array.isArray(genericBlocks)) {
    for (const block of genericBlocks) {
      if (block.__component === 'app-components.app-product-category') {
        const categories = block?.app_product_categories ?? [];

        for (const cat of categories) {
          const firstCentral =
            Array.isArray(cat?.web_central_catalogue_categories) &&
            cat.web_central_catalogue_categories.length > 0
              ? cat.web_central_catalogue_categories[0]
              : null;

          const candidate = firstCentral?.categorySlug;

          if (typeof candidate === 'string' && candidate.trim()) {
            slug = candidate.trim();
            break;
          }
        }
      }
      if (slug) break;
    }
  }
  if (!slug) {
    const blocks = cmsResponse.data?.data?.blocks ?? [];

    const productCategoryBlocks = Array.isArray(blocks)
      ? blocks.filter((b: any) => b.__component === 'app-components.app-product-category')
      : [];

    const firstBlock = productCategoryBlocks[0];
    const firstProductCategory =
      Array.isArray(firstBlock?.app_product_categories) &&
      firstBlock.app_product_categories.length > 0
        ? firstBlock.app_product_categories[0]
        : null;

    const firstCentral =
      Array.isArray(firstProductCategory?.web_central_catalogue_categories) &&
      firstProductCategory.web_central_catalogue_categories.length > 0
        ? firstProductCategory.web_central_catalogue_categories[0]
        : null;

    const candidate = firstCentral?.categorySlug;
    if (typeof candidate === 'string' && candidate.trim()) {
      slug = candidate.trim();
    }
  }

  if (!slug) {
    Logger.warn(
      `[extractProductListingSlugv3] No categorySlug found in CMS response. Returning request without body to avoid bad POST payload.`,
    );
    return {
      ...request,
      body: undefined,
    };
  }

  const requestBody = {
    offSet: 0,
    limit: 21,
    slug,
    storefront: 'msme',
  };
  Logger.log(`[extractProductListingSlugv3] Using slug="${slug}"`);

  return {
    ...request,
    body: requestBody,
    headers: {
      ...request.headers,
    },
  };
}

export function getAllCentralCatalogueCategoryIdsv3(page: any): string[] {
  const ids: string[] = [];

  const pushIds = (arr: any[]) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      const id = item?.categoryId;
      if (typeof id === 'string' && id.trim()) ids.push(id.trim());
    }
  };
  const genericBlocks = page?.genericPage ?? [];

  if (Array.isArray(genericBlocks)) {
    for (const block of genericBlocks) {
      if (block.__component === 'app-components.app-category-component') {
        pushIds(block?.web_central_catalogue_categories);
      }

      if (block.__component === 'app-components.app-product-category') {
        const categories = block?.app_product_categories ?? [];
        for (const cat of categories) {
          pushIds(cat?.web_central_catalogue_categories);
        }
      }
    }
  }

  // 1) category_component.web_central_catalogue_categories[]
  pushIds(page?.category_component?.web_central_catalogue_categories);

  // 2) top_brand_component.web_central_catalogue_categories[]
  pushIds(page?.top_brand_component?.web_central_catalogue_categories);

  // 3) product_category_component[*].product_categories[*].web_central_catalogue_categories[]
  const pcc = page?.product_category_component;
  if (Array.isArray(pcc)) {
    for (const comp of pcc) {
      const categories = comp?.product_categories ?? comp?.app_product_categories ?? [];
      if (!Array.isArray(categories)) continue;

      for (const cat of categories) {
        pushIds(cat?.web_central_catalogue_categories);
      }
    }
  }

  // 4) Fallback: if caller accidentally passes old "blocks" array instead of v3 page
  if (Array.isArray(page)) {
    const blocks = page;

    const fromArray = blocks
      .filter((b: any) => Array.isArray(b.web_central_catalogue_categories))
      .flatMap((b: any) => b.web_central_catalogue_categories.map((c: any) => c?.categoryId))
      .filter(Boolean);

    const fromObject = blocks
      .filter((b: any) => b.web_central_catalogue_category?.categoryId)
      .map((b: any) => b.web_central_catalogue_category.categoryId)
      .filter(Boolean);

    ids.push(...fromArray, ...fromObject);
  }

  return [...new Set(ids)];
}