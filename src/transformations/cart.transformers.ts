import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';

export function mergeCartPageResponses(aggregatedResponses: AggregatedResponse[]): any {
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

  safeDebug(
    Logger,
    () =>
      ` Strapi Cart Page Api response from method: mergeCartPageResponses : ${JSON.stringify(
        strapiCartPageResponse,
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      ` Buy Again Api response from method: mergeCartPageResponses : ${JSON.stringify(
        buyAgainApiResponse,
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      ` Cart Summary Api response from method: mergeCartPageResponses : ${JSON.stringify(
        cartSummaryApiResponse,
      )}`,
  );

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
    Array.isArray((strapiCartPageResponse.data.data as { blocks?: unknown[] }).blocks)
  ) {
    originalBlocks = [
      ...((strapiCartPageResponse.data.data as { blocks?: unknown[] }).blocks as unknown[]),
    ];
    const blocks: any[] = originalBlocks;

    const buyAgainProducts = (buyAgainApiResponse?.data as { listOfBuyAgainProducts?: unknown })
      ?.listOfBuyAgainProducts;
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

// Merge Response for web cart page (banner CMS + cart data + credit instruments)
export function mergeWebCartPageResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const cmsResponse = responses['web-cart-page-cms'];
  const cartGetResponse = responses['web-cart-get'];
  const creditInstrumentResponse = responses['web-credit-instrument'];

  safeDebug(Logger, () => `web-cart-page CMS response: ${JSON.stringify(cmsResponse)}`);
  safeDebug(Logger, () => `web-cart-get response: ${JSON.stringify(cartGetResponse)}`);
  safeDebug(
    Logger,
    () => `web-credit-instrument response: ${JSON.stringify(creditInstrumentResponse)}`,
  );

  if (
    !cmsResponse?.success ||
    typeof cmsResponse.data !== 'object' ||
    cmsResponse.data === null
  ) {
    Logger.error(
      `Error for Web Cart Page API method: mergeWebCartPageResponses - CMS response missing or invalid`,
    );
    return { data: {}, meta: {} };
  }

  const mergedData: Record<string, unknown> = {
    ...(cmsResponse.data.data as Record<string, unknown>),
  };

  if (cartGetResponse?.success && cartGetResponse?.data) {
    mergedData.cart = cartGetResponse.data;
  }

  if (creditInstrumentResponse?.success && creditInstrumentResponse?.data) {
    mergedData.creditInstruments = creditInstrumentResponse.data;
  }

  return {
    data: mergedData,
    meta: (cmsResponse.data as { meta?: unknown }).meta ?? {},
  };
}

// Merge Response for mweb cart page
export function mergeMmebCartPageResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const strapiCartPageResponse = responses['mweb-cart-page'];
  const buyAgainApiResponse = responses['cart-page-buy-again'];

  safeDebug(
    Logger,
    () =>
      ` Strapi Cart Page Api response from method: mergeCartPageResponses : ${JSON.stringify(
        strapiCartPageResponse,
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      ` Buy Again Api response from method: mergeCartPageResponses : ${JSON.stringify(
        buyAgainApiResponse,
      )}`,
  );

  if (
    !strapiCartPageResponse?.success ||
    typeof strapiCartPageResponse.data !== 'object' ||
    strapiCartPageResponse.data === null ||
    typeof strapiCartPageResponse.data.data !== 'object' ||
    strapiCartPageResponse.data.data === null
  ) {
    Logger.error(
      `Error for Cart Page API method: mergeCartPageResponses Strapi cart page response is missing or invalid`,
    );
    return { data: {}, meta: {}, success: false };
  }

  if (!buyAgainApiResponse || !buyAgainApiResponse?.success) {
    Logger.error(
      `Error for Cart Page API method: mergeCartPageResponses Strapi cart page response is missing or invalid`,
    );
    return { data: strapiCartPageResponse?.data?.data, success: true };
  }
  const strapiCartData = strapiCartPageResponse?.data?.data as { blocks?: any[] };
  const blocks: any[] = Array.isArray(strapiCartData?.blocks) ? [...strapiCartData.blocks] : [];

  const rawData = buyAgainApiResponse?.data?.data ?? {};
  const { listOfBuyAgainProducts, variantList, skuSize } = rawData;

  const buyAgainProducts =
    listOfBuyAgainProducts ?? variantList ?? (Array.isArray(rawData) ? rawData : []);

  // Inject the buy again products into the buy again block
  if (buyAgainProducts.length > 0) {
    const buyAgainBlock = blocks.find(
      (block) => block.__component === 'app-components.app-buy-again',
    );
    if (buyAgainBlock) {
      buyAgainBlock.listOfBuyAgainProducts = buyAgainProducts;
      if (variantList) buyAgainBlock.variantList = variantList;
      if (skuSize != null) buyAgainBlock.skuSize = skuSize;
    }
  }
  return {
    ...strapiCartData,
    blocks,
  };
}
