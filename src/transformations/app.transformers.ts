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

  // Prepare buy again block if available
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

  mergedData.blocks = blocks;

  return {
    data: mergedData,
  };
}
