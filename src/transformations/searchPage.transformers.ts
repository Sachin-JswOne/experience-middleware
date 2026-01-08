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

  safeDebug(Logger, () => `Search Page CMS → ${JSON.stringify(cmsResponse?.data)}`);
  safeDebug(Logger, () => `Buy Again → ${JSON.stringify(buyAgainResponse?.data)}`);

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
  // APP FLOW → CMS never had buy-again block → show top items
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
