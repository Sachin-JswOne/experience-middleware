/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AggregatedResponse } from 'src/models/aggregated-response.model';

export function mergeHomePageResponses(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
  const strapiResponse = responses['app-home-page'];
  const topItemsResponse = responses['app-top-items'];
  const buyAgainResponse = responses['app-buy-again'];
  const categoriesResponse = responses['app-categories'];
  if (
    !strapiResponse ||
    typeof strapiResponse.data !== 'object' ||
    strapiResponse.data === null
  ) {
    return { data: {}, meta: {} };
  }

  // Clone the strapi response data to avoid mutating the original
  const mergedData: Record<string, unknown> = { ...strapiResponse.data.data };

  // Find the blocks array in the strapi response
  let originalBlocks: unknown[] = [];
  if (
    typeof strapiResponse.data === 'object' &&
    strapiResponse.data.data !== null &&
    Array.isArray((strapiResponse.data.data as { blocks?: unknown[] }).blocks)
  ) {
    originalBlocks = [
      ...((strapiResponse.data.data as { blocks?: unknown[] })
        .blocks as unknown[]),
    ];
  }
  const blocks: any[] = originalBlocks;
  const buyAgainProducts = (
    buyAgainResponse?.data as { listOfBuyAgainProducts?: unknown }
  )?.listOfBuyAgainProducts;
  if (Array.isArray(buyAgainProducts)) {
    const buyAgainBlock = blocks.find(
      (block) => block.__component === 'app-components.app-buy-again',
    );
    if (buyAgainBlock) {
      buyAgainBlock.listOfBuyAgainProducts = buyAgainProducts;
    }
  }

  // Prepare top items block if available
  const topProducts = (topItemsResponse?.data as { topProducts?: unknown })
    ?.topProducts;
  if (Array.isArray(topProducts)) {
    const topItemsBlock = blocks.find(
      (block) => block.__component === 'app-components.app-top-items',
    );
    if (topItemsBlock) {
      topItemsBlock.topProducts = topProducts;
    }
  }

  const categories: any[] | undefined = (
    categoriesResponse?.data as { categories?: any[] }
  )?.categories;
  const categoriesBlock = blocks.find(
    (block) => block.__component === 'app-components.app-category-component',
  );
  if (categoriesBlock && categoriesBlock.product_categories) {
    let filteredCategories: any[] = [];
    if (categories) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      filteredCategories = categoriesBlock.product_categories.filter(
        (category) =>
          categories.some((c: any) => c.categoryId === category.categoryId),
      );
    }
    categoriesBlock.product_categories = filteredCategories;
  }

  mergedData.blocks = blocks;

  return {
    data: mergedData,
  };
}

export function mergeBuyAgainResponses(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const buyAgainPriceApiResponse = responses['ccp-buy-again-with-prices'];
  const buyAgainRetailApiResponse = responses['app-buy-again'];

  if (buyAgainRetailApiResponse.success) {
    if (buyAgainPriceApiResponse.data && buyAgainRetailApiResponse.data) {
      if (buyAgainPriceApiResponse.data.length === 0) {
        if (buyAgainRetailApiResponse.data.listOfBuyAgainProducts) {
          buyAgainRetailApiResponse.data.listOfBuyAgainProducts.forEach(
            (product: any) => {
              product.price = '';
            },
          );
        }
        return buyAgainRetailApiResponse.data;
      }
      if (
        Array.isArray(buyAgainPriceApiResponse.data) &&
        Array.isArray(buyAgainRetailApiResponse.data.listOfBuyAgainProducts)
      ) {
        buyAgainRetailApiResponse.data.listOfBuyAgainProducts.forEach(
          (product: any) => {
            const priceProduct = buyAgainPriceApiResponse.data.find(
              (p: any) => p.variantKey === product.variantKey,
            );
            if (priceProduct) {
              product.price = priceProduct.displayVariantLineItemPrice || '';
            } else {
              product.price = '';
            }
          },
        );
      }
      return buyAgainRetailApiResponse.data;
    }
  } else {
    return {
      listOfBuyAgainProducts: [],
    };
  }
}
