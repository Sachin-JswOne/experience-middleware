import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug, safeToLog } from 'src/utils/common-functions.util';
import { BaseRequest } from 'src/models/base-request.model';
import { extractMMIDs,
  getAllCentralCatalogueCategoryIds } from './web.transformers';
import { inspect } from 'util';
import { CustomError } from 'src/utils/CustomError';

export function mergeAppHomePageResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
  const strapiResponse = responses['app-home-page'];
  const buyAgainResponse = responses['app-buy-again'];
  const topBrandsResponse = responses['app-top-brands'];
  const categoriesResponse = responses['app-categories'];
  const blogResponse = responses['app-blogs'];
  const inTransitResponse = responses['app-in-transit'];
  const topItemsResponse = responses['app-search-top-items'];
  safeDebug(
    Logger,
    () =>
      `Strapi Home Page Api response from method: mergeAppHomePageResponses : ${inspect(
        strapiResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Buy Again Api response from method: mergeAppHomePageResponses : ${inspect(
        buyAgainResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Categories Api response from method: mergeAppHomePageResponses : ${inspect(
        categoriesResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () => `Blog Api response from method: mergeAppHomePageResponses : ${inspect(blogResponse)}`,
  );
  safeDebug(
    Logger,
    () =>
      `In Transit Api response from method: mergeAppHomePageResponses : ${inspect(
        inTransitResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Top Items Api response from method: mergeAppHomePageResponses : ${inspect(
        topItemsResponse,
      )}`,
  );
  if (!strapiResponse || typeof strapiResponse.data !== 'object' || strapiResponse.data === null) {
    Logger.error(
      `Error for Home Page API method: mergeAppHomePageResponses Strapi response is missing or invalid`,
    );
    return { data: {}, meta: {} };
  }

  // Clone the strapi response data to avoid mutating the original
  const mergedData: Record<string, unknown> = { ...strapiResponse?.data?.data };

  // Find the blocks array in the strapi response
  let originalBlocks: unknown[] = [];
  if (
    typeof strapiResponse?.data === 'object' &&
    strapiResponse.data?.data !== null &&
    Array.isArray((strapiResponse?.data?.data as { blocks?: unknown[] }).blocks)
  ) {
    originalBlocks = [
      ...((strapiResponse?.data?.data as { blocks?: unknown[] }).blocks as unknown[]),
    ];
  }
  const blocks: any[] = originalBlocks;

  const buyAgainProducts = (buyAgainResponse?.data as { listOfBuyAgainProducts?: unknown })
    ?.listOfBuyAgainProducts;
  if (Array.isArray(buyAgainProducts)) {
    const buyAgainBlock = blocks.find(
      (block) => block.__component === 'app-components.app-buy-again',
    );
    if (buyAgainBlock) {
      buyAgainBlock.listOfBuyAgainProducts = buyAgainProducts;
    }
  }

  // inject top brand categories data into app-top-brands blocks
  if (topBrandsResponse?.success && Array.isArray(topBrandsResponse?.data?.data?.navigation)) {
    const topBrandNavigation = topBrandsResponse.data.data.navigation;

    const topBrandsBlocks = blocks.filter(
      (b: any) =>
        b.__component === 'app-components.app-top-brands' &&
        Array.isArray(b.web_central_catalogue_categories),
    );

    for (const block of topBrandsBlocks) {
      const blockCategoryIds = block.web_central_catalogue_categories
        .map((c: any) => c.categoryId)
        .filter(Boolean);

      const centralCategoryBrandData = topBrandNavigation
        .map((nav: any) => ({
          ...nav,
          subMenu: nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)),
        }))
        .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);

      if (centralCategoryBrandData.length > 0) {
        block.centralCatalogueBrandsList = centralCategoryBrandData[0].subMenu.map((brand) => ({
          name: brand.name || '',
          slug: brand.slug || '',
          image: brand.metaImage.url || '',
        }));
      } else {
        block.centralCatalogueBrandsList = [];
      }
    }
  }

  if (topItemsResponse?.success && Array.isArray(topItemsResponse?.data?.data?.products)) {
    const topItems = topItemsResponse?.success
      ? (topItemsResponse?.data?.data?.products ?? topItemsResponse.data?.products ?? [])
      : null;

    if (!Array.isArray(topItems) || topItems.length === 0) {
      safeDebug(
        Logger,
        () => `Top Items from Central Catalogue: empty/fail; keeping CMS top items as-is.`,
      );
    } else {
      const topItemBlock = blocks.filter(
        (b: any) =>
          b.__component === 'app-components.app-search-top-items' &&
          Array.isArray(b.app_search_top_items),
      );

      for (const block of topItemBlock) {
        const cmsItems = block.app_search_top_items;

        const productMap = new Map(
          topItems
            .filter((p) => typeof p?.product_mmid === 'string' && p.product_mmid.length > 0)
            .map((p) => [p.product_mmid, p]),
        );

        block.centralCatalogueTopItemList = cmsItems
          .map((cmsItem) => {
            const product = productMap.get(cmsItem.MMID);

            if (!product) return null;

            return {
              title: product?.attributes?.product_title,
              webUrl: product?.attributes?.slug,
              MMID: product?.product_mmid,
              brand: product?.attributes?.brand,
              image: product?.meta_data?.product_media?.[0]?.public_url,
              categoryName: product?.associated_categories?.find((cat) =>
                cat?.path?.toLowerCase().includes('all products'),
              )?.attributes?.category_title,
            };
          })
          .filter(Boolean);
      }
    }
  }

  // // inject central catalogue categories
  if (categoriesResponse?.success && Array.isArray(categoriesResponse.data?.data?.navigation)) {
    const navigation = categoriesResponse.data.data.navigation;

    // inject central catalogue categories into all blocks that contain them
    const categoryBlocks = blocks.filter(
      (b: any) =>
        b.__component === 'app-components.app-category-component' &&
        Array.isArray(b.web_central_catalogue_categories),
    );

    for (const block of categoryBlocks) {
      const blockCategoryIds = block.web_central_catalogue_categories
        .map((c: any) => c.categoryId)
        .filter(Boolean);

      const centralCategoryCategoriesData = navigation
        .map((nav: any) => ({
          ...nav,
          subMenu: nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)),
        }))
        .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);
      if (centralCategoryCategoriesData.length > 0) {
        block.centralCatalogueCategoriesList = centralCategoryCategoriesData[0].subMenu.map(
          (category: any) => ({
            name: category.name || '',
            slug: category.slug || '',
            image: category.metaImage.url || '',
          }),
        );
      } else {
        block.centralCatalogueCategoriesList = [];
      }
    }
  }

  let inTransit = false;
  if (
    inTransitResponse?.success &&
    inTransitResponse?.data?.success &&
    inTransitResponse?.data?.data?.success
  ) {
    const inTransitData = inTransitResponse.data.data.response.data;
    if (inTransitData && inTransitData.length > 0) {
      inTransit = true;
    }
  }

  const inTransitBlock = blocks.find(
    (block) => block.__component === 'app-components.app-link-banner',
  );
  if (inTransitBlock) {
    inTransitBlock.inTransit = inTransit;
  }

  mergedData.blocks = blocks;

  return {
    data: mergedData,
  };
}

// This transformer is used to extract MMIDs from request
export function transformTopItemsRequest(request: BaseRequest) {
  const topItemsResponse = request.body.blocks.find(
    (block) => block.__component === 'app-components.app-search-top-items',
  ).app_search_top_items;
  const mmids = extractMMIDs(topItemsResponse);
  return {
    ...request,
    body: mmids,
  };
}

export function selectAppHomePageV3TargetByUserType(req: Request): string {
  const userType = String(req.headers?.['x-user-state'] ?? '').toUpperCase();

  if (userType === 'G') {
    return 'app-home-page-v3-guest';
  } else return 'app-home-page-v3-registered';
}

export function extractBrandCategoryIds(request: BaseRequest): BaseRequest {
  const blocks = request.body.blocks ?? [];

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

export function extractCentralCatalogueCategoryIds(request: BaseRequest): BaseRequest {
  const blocks = request.body.blocks ?? [];
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

export function mergeAppHomePageResponsesV3FromNestedParallel(
  aggregatedResponses: AggregatedResponse[],
): any {
  const cmsAgg = aggregatedResponses.find((r) => r.target === 'app-home-page');

  const helperAgg = aggregatedResponses.find((r) => r.target?.includes('parallel-helper'));

  if (!helperAgg) {
    throw new CustomError('app-home-page-v3 parallel helper response missing', 500);
  }

  if (!helperAgg.success) {
    Logger.error(
      `app-home-page-v3 parallel helper failed: ${safeToLog(helperAgg.error)} | downstream=${safeToLog(
        helperAgg.downstreamResponse,
      )}`,
    );

    throw new CustomError(
      `app-home-page-v3 parallel helper failed: ${helperAgg.error ?? 'unknown error'}`,
      helperAgg.httpStatus ?? 500,
    );
  }

  if (!Array.isArray(helperAgg.data)) {
    Logger.error(
      `app-home-page-v3 parallel helper returned non-array data: ${safeToLog(helperAgg.data)}`,
    );
    throw new CustomError('app-home-page-v3 parallel helper returned non-array data', 500);
  }
  return mergeAppHomePageResponses([...(cmsAgg ? [cmsAgg] : []), ...helperAgg.data]);
}

export function prepareWebHomePageV3ParallelPayload(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  const responses = prevResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
  const aggregateResponse = responses['app-home-page'].data.data;
  return {
    ...request,
    body: aggregateResponse,
  };
}
