import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { normalizeRecentlyViewedProducts, RecentlyViewedProduct } from './web.transformers';
export {
  extractCentralCatalogueCategoryIds
} from 'src/utils/central-category.util';

function mapResponsesByTarget(
  aggregatedResponses: AggregatedResponse[],
): Record<string, AggregatedResponse> {
  return aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
}

function isValidCmsResponse(cmsResponse?: AggregatedResponse): boolean {
  return !!(
    cmsResponse?.success &&
    typeof cmsResponse.data === 'object' &&
    cmsResponse.data !== null &&
    typeof cmsResponse.data.data === 'object' &&
    cmsResponse.data.data !== null
  );
}

function getSearches(responseData: any): any[] {
  return responseData?.success && Array.isArray(responseData.data) ? responseData.data : [];
}

function getRemovedMmids(recentViewedRemoveAgg?: AggregatedResponse): string[] {
  if (recentViewedRemoveAgg?.success && recentViewedRemoveAgg.data?.data?.removeProduct) {
    return recentViewedRemoveAgg.data.data.removeProduct;
  }

  if (recentViewedRemoveAgg && !recentViewedRemoveAgg.success) {
    Logger.warn(
      'Search Page: recent-viewed-remove failed',
      recentViewedRemoveAgg.error ?? 'Unknown error',
    );
  }

  return [];
}

function getRecentlyViewedProducts(
  recentlyViewedAgg: AggregatedResponse | undefined,
  removedMmids: string[],
): RecentlyViewedProduct[] {
  if (!recentlyViewedAgg) {
    return [];
  }

  if (!recentlyViewedAgg.success) {
    Logger.warn(
      'Search Page: recently-viewed-product-details failed',
      recentlyViewedAgg.error ?? 'Unknown error',
    );
    return [];
  }

  return normalizeRecentlyViewedProducts(recentlyViewedAgg.data).filter(
    (product) => !removedMmids.includes(product.mmid),
  );
}

function injectBuyAgainBlock(blocks: any[], buyAgainResponse: any): void {
  const hasBuyAgainBlock = blocks.some(
    (block) => block.__component === 'app-components.app-buy-again',
  );

  if (!buyAgainResponse?.success || !hasBuyAgainBlock) {
    return;
  }

  const rawData = buyAgainResponse.data ?? {};
  const { listOfBuyAgainProducts, variantList, skuSize } = rawData;
  const products = listOfBuyAgainProducts ?? variantList ?? (Array.isArray(rawData) ? rawData : []);

  if (products.length === 0) {
    return;
  }

  const filteredBlocks = blocks.filter(
    (block) => block.__component !== 'app-components.app-search-top-items',
  );

  const buyAgainBlock = filteredBlocks.find(
    (block) => block.type === 'buy-again' || block.__component === 'app-components.app-buy-again',
  );

  if (buyAgainBlock) {
    buyAgainBlock.listOfBuyAgainProducts = products;
    if (variantList) buyAgainBlock.variantList = variantList;
    if (skuSize != null) buyAgainBlock.skuSize = skuSize;
  }

  blocks.length = 0;
  blocks.push(...filteredBlocks);
}

function removeTopItemsBlock(blocks: any[]): any[] {
  return blocks.filter((block) => block.__component !== 'app-components.app-search-top-items');
}

function injectTopItemsBlock(blocks: any[], topItemsResponse: any): boolean {
  const ccpProducts = topItemsResponse?.data?.products;

  if (!Array.isArray(ccpProducts)) {
    Logger.warn(
      'central_catalogue_global enabled but CCP top-items failed. Removing top-items block.',
    );
    return false;
  }

  const topItemsBlock = blocks.find(
    (block) => block.__component === 'app-components.app-search-top-items',
  );

  if (!topItemsBlock || !Array.isArray(topItemsBlock.app_search_top_items)) {
    return true;
  }

  const productMap = new Map(ccpProducts.map((product) => [product.product_mmid, product]));

  topItemsBlock.app_search_top_items = topItemsBlock.app_search_top_items
    .map((cmsItem) => {
      const product = productMap.get(cmsItem.MMID);

      if (!product) {
        safeDebug(Logger, () => `TOP ITEMS MMID NOT FOUND | MMID: ${cmsItem.MMID}`);
        return null;
      }

      safeDebug(Logger, () => `TOP ITEMS MMID MATCHED | MMID: ${cmsItem.MMID}`);

      return {
        ...cmsItem,
        title: product.attributes?.product_title,
        webUrl: product.attributes?.slug,
        MMID: product.product_mmid,
        image: {
          ...cmsItem.image,
          url: product.meta_data?.product_media?.[0]?.public_url,
        },
      };
    })
    .filter(Boolean);

  return true;
}

function getCentralCatalogueNavigation(webCentralCatalogueResponse?: AggregatedResponse): any[] | null {
  if (
    webCentralCatalogueResponse?.success &&
    Array.isArray(webCentralCatalogueResponse.data?.data?.navigation)
  ) {
    return webCentralCatalogueResponse.data.data.navigation;
  }

  return null;
}

function injectCentralCatalogueCategories(blocks: any[], navigation: any[] | null): void {
  for (const block of blocks) {
    if (block.__component !== 'app-components.app-category-component') {
      continue;
    }

    if (!navigation || !Array.isArray(block.web_central_catalogue_categories)) {
      block.product_categories = [];
      continue;
    }

    const blockCategoryIds = block.web_central_catalogue_categories
      .map((category: any) => category.categoryId)
      .filter(Boolean);

    block.product_categories = navigation
      .flatMap((nav: any) =>
        nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)) ?? [],
      )
      .map((ccItem: any) => ({
        id: ccItem.id,
        description: ccItem.metaDescription,
        displayName: ccItem.name,
        image: ccItem.metaImage,
        webUrl: ccItem.seoUrl,
      }));
  }
}

function buildSearchPageResponse(
  cmsData: any,
  blocks: any[],
  recentSearches: any[],
  trendingSearches: any[],
  recentlyViewedProducts: RecentlyViewedProduct[],
  removedMmids: string[],
): any {
  return {
    data: {
      ...cmsData,
      blocks,
      recentSearches,
      trendingSearches,
      recentlyViewedProducts,
      removedMmids,
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };
}

export function getSearchPageDetails(aggregatedResponses: AggregatedResponse[]): any {
  const responses = mapResponsesByTarget(aggregatedResponses);

  const cmsResponse = responses['app-search-page'];
  const buyAgainResponse = responses['ccp-buy-again-with-prices']?.data;
  const recentSearchResponse = responses['ccp-recent-search']?.data;
  const trendingSearchResponse = responses['ccp-trending-search']?.data;
  const webCentralCatalogueResponse = responses['web-central-catalogue-categories'];
  const topItemsResponse = responses['search-top-items']?.data;
  const recentlyViewedAgg = responses['recently-viewed-product-details'];
  const recentViewedRemoveAgg = responses['recent-viewed-remove'];

  safeDebug(Logger, () => `Search Page CMS → ${JSON.stringify(cmsResponse?.data)}`);
  safeDebug(Logger, () => `Buy Again → ${JSON.stringify(buyAgainResponse?.data)}`);
  safeDebug(Logger, () => `Top Items → ${JSON.stringify(topItemsResponse?.data)}`);
  safeDebug(Logger, () => `Search Page recentlyviewed → ${JSON.stringify(recentlyViewedAgg?.data)}`);
  safeDebug(Logger, () => `Search Page recentremovedmmids → ${JSON.stringify(recentViewedRemoveAgg?.data)}`);

  if (!isValidCmsResponse(cmsResponse)) {
    Logger.error('Search Page Transformer: CMS data missing');
    return { data: {}, meta: {}, success: false };
  }

  const cmsData = cmsResponse.data.data as { blocks?: any[] };
  const blocks: any[] = Array.isArray(cmsData?.blocks) ? [...cmsData.blocks] : [];

  const recentSearches = getSearches(recentSearchResponse);
  const trendingSearches = getSearches(trendingSearchResponse);
  const removedMmids = getRemovedMmids(recentViewedRemoveAgg);
  const recentlyViewedProducts = getRecentlyViewedProducts(recentlyViewedAgg, removedMmids);

  injectBuyAgainBlock(blocks, buyAgainResponse);

  const shouldKeepTopItemsBlock = injectTopItemsBlock(blocks, topItemsResponse);
  const finalBlocks = shouldKeepTopItemsBlock ? blocks : removeTopItemsBlock(blocks);

  const navigation = getCentralCatalogueNavigation(webCentralCatalogueResponse);
  injectCentralCatalogueCategories(finalBlocks, navigation);

  return buildSearchPageResponse(
    cmsData,
    finalBlocks,
    recentSearches,
    trendingSearches,
    recentlyViewedProducts,
    removedMmids,
  );
}