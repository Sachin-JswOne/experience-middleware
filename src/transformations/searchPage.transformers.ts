import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';
import { AggregatedResponse } from 'src/models/aggregated-response.model';

export function getSearchPageDetails(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, r) => ((acc[r.target] = r), acc),
    {} as Record<string, AggregatedResponse>,
  );

  const cmsResponse = responses['app-search-page'];
  const buyAgainResponse = responses['ccp-buy-again-with-prices']?.data;
  const recentSearchResponse = responses['ccp-recent-search']?.data;
  const featureFlags = responses['cmsFeatureFlag']?.data?.data ?? [];
  const topItemsResponse = responses['search-top-items']?.data;
  const isCentralCatalogueEnabled = featureFlags.some(
    (f) => f.name === 'central_catalogue_global' && f.isActive === true,
  );

  safeDebug(Logger, () => `Search Page CMS → ${JSON.stringify(cmsResponse?.data)}`);
  safeDebug(Logger, () => `Buy Again → ${JSON.stringify(buyAgainResponse?.data)}`);
  safeDebug(Logger, () => `Top Items → ${JSON.stringify(topItemsResponse?.data)}`);
  if (
    !cmsResponse?.success ||
    typeof cmsResponse.data !== 'object' ||
    cmsResponse.data === null ||
    typeof cmsResponse.data.data !== 'object' ||
    cmsResponse.data.data === null
  ) {
    Logger.error('Search Page Transformer: CMS data missing');
    return { data: {}, meta: {}, success: false };
  }

  const cmsData = cmsResponse.data.data as { blocks?: any[] };

  const blocks: any[] = Array.isArray(cmsData?.blocks) ? [...cmsData.blocks] : [];

  const recentSearches =
    recentSearchResponse?.success && Array.isArray(recentSearchResponse.data)
      ? recentSearchResponse.data
      : [];
  const hasBuyAgainBlock = blocks.some((b) => b.__component === 'app-components.app-buy-again');
  //BUY AGAIN → UPDATE EXISTING BLOCK
  if (buyAgainResponse?.success && hasBuyAgainBlock) {
    const rawData = buyAgainResponse.data ?? {};
    const { listOfBuyAgainProducts, variantList, skuSize } = rawData;

    const products =
      listOfBuyAgainProducts ?? variantList ?? (Array.isArray(rawData) ? rawData : []);

    if (products.length > 0) {
      // Remove search top items block
      const filteredBlocks = blocks.filter(
        (b) => b.__component !== 'app-components.app-search-top-items',
      );

      // Find buy-again block (from CMS)
      const buyAgainBlock = filteredBlocks.find(
        (b) => b.type === 'buy-again' || b.__component === 'app-components.app-buy-again',
      );

      if (buyAgainBlock) {
        // Inject buy again data
        buyAgainBlock.listOfBuyAgainProducts = products;
        if (variantList) buyAgainBlock.variantList = variantList;
        if (skuSize != null) buyAgainBlock.skuSize = skuSize;
      }

      // Final assigned blocks
      return {
        data: {
          ...cmsData,
          blocks: filteredBlocks,
          recentSearches,
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      };
    }
  } else if (!buyAgainResponse?.success && hasBuyAgainBlock) {
    const filteredBlocks = blocks.filter(
      (b) => b.__component !== 'app-components.app-search-top-items',
    );

    return {
      data: {
        ...cmsData,
        blocks: filteredBlocks,
        recentSearches,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }
  if (isCentralCatalogueEnabled) {
    const ccpProducts = topItemsResponse?.data?.products;
    if (!Array.isArray(ccpProducts)) {
      Logger.warn(
        'central_catalogue_global enabled but CCP top-items failed. Removing top-items block.',
      );

      const filteredBlocks = blocks.filter(
        (b) => b.__component !== 'app-components.app-search-top-items',
      );

      return {
        data: {
          ...cmsData,
          blocks: filteredBlocks,
          recentSearches,
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
      };
    }
    // Find CMS Top Items block
    const topItemsBlock = blocks.find(
      (b) => b.__component === 'app-components.app-search-top-items',
    );

    if (topItemsBlock && Array.isArray(topItemsBlock.app_search_top_items)) {
      const cmsItems = topItemsBlock.app_search_top_items;

      // Map CCP products by MMID
      const productMap = new Map(ccpProducts.map((p) => [p.product_mmid, p]));

      // Inject CCP data into CMS items
      topItemsBlock.app_search_top_items = cmsItems.map((cmsItem) => {
        const product = productMap.get(cmsItem.MMID);
        if (!product) return [];
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
      },
    );
  }
}
  //  NO BUY AGAIN → Return CMS blocks as-is with search-top-items
  return {
    data: {
      ...cmsData,
      blocks,
      recentSearches,
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };
}
