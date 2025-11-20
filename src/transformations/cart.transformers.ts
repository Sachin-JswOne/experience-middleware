/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';

export function mergeCartPageResponses(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const strapiCartPageResponse = responses['app-cart-page'];
  const buyAgainApiResponse = responses['app-buy-again'];
  const cartSummaryApiResponse = responses['app-cart-summary'];

  if (
    !strapiCartPageResponse ||
    typeof strapiCartPageResponse.data !== 'object' ||
    strapiCartPageResponse.data === null
  ) {
    Logger.error(
      `Error for Cart Page API method: mergeCartPageResponses Strapi cart page response is missing or invalid`,
    );
    return { data: {}, meta: {} };
  }

  // Clone the strapi response data to avoid mutating the original
  const mergedData: Record<string, unknown> = {
    ...strapiCartPageResponse.data.data,
  };

  // Find the blocks array in the strapi response
  let originalBlocks: unknown[] = [];
  if (
    typeof strapiCartPageResponse.data === 'object' &&
    strapiCartPageResponse.data.data !== null &&
    Array.isArray(
      (strapiCartPageResponse.data.data as { blocks?: unknown[] }).blocks,
    )
  ) {
    originalBlocks = [
      ...((strapiCartPageResponse.data.data as { blocks?: unknown[] })
        .blocks as unknown[]),
    ];
    const blocks: any[] = originalBlocks;

    const buyAgainProducts = (
      buyAgainApiResponse?.data as { listOfBuyAgainProducts?: unknown }
    )?.listOfBuyAgainProducts;
    if (Array.isArray(buyAgainProducts)) {
      const buyAgainBlock = blocks.find(
        (block) => block.__component === 'app-components.app-buy-again',
      );
      if (buyAgainBlock) {
        buyAgainBlock.listOfBuyAgainProducts = buyAgainProducts;
      }
    }

    const cartProducts = cartSummaryApiResponse?.data;
    if (typeof cartProducts === 'object') {
      const cartProductsBlock = blocks.find(
        (block) => block.__component === 'app-components.app-cart-product',
      );
      if (cartProductsBlock) {
        cartProductsBlock.cartSummary = cartProducts;
      }
    }
    mergedData.blocks = blocks;

    return {
      data: mergedData,
    };
  }
  Logger.error(
    `Error for Cart Page API method: mergeCartPageResponses Strapi cart page data structure is invalid`,
  );
  return { data: {}, meta: {} };
}
