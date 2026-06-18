import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { BaseRequest } from 'src/models/base-request.model';
import { safeDebug } from 'src/utils/common-functions.util';
import { inspect } from 'util';

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

function isValidStrapiResponse(strapiResponse?: AggregatedResponse): boolean {
  return !!(
    strapiResponse &&
    typeof strapiResponse.data === 'object' &&
    strapiResponse.data !== null
  );
}

function getBlocks(strapiResponse: AggregatedResponse): any[] {
  const blocks = (strapiResponse.data?.data as { blocks?: unknown[] })?.blocks;
  return Array.isArray(blocks) ? [...blocks] : [];
}

function injectBuyAgainBlock(blocks: any[], buyAgainResponse?: AggregatedResponse): void {
  const buyAgainProducts = (buyAgainResponse?.data as { listOfBuyAgainProducts?: unknown })
    ?.listOfBuyAgainProducts;

  if (!Array.isArray(buyAgainProducts)) {
    return;
  }

  const buyAgainBlock = blocks.find(
    (block) => block.__component === 'app-components.app-buy-again',
  );

  if (buyAgainBlock) {
    buyAgainBlock.listOfBuyAgainProducts = buyAgainProducts;
  }
}

function injectTopItemsBlock(blocks: any[], topItemsResponse?: AggregatedResponse): void {
  const topProducts = (topItemsResponse?.data as { topProducts?: unknown })?.topProducts;

  if (!Array.isArray(topProducts)) {
    return;
  }

  const topItemsBlock = blocks.find(
    (block) => block.__component === 'app-components.app-top-items',
  );

  if (topItemsBlock) {
    topItemsBlock.topProducts = topProducts;
  }
}

function injectCategoriesBlock(blocks: any[], categoriesResponse?: AggregatedResponse): void {
  const categories = (categoriesResponse?.data as { categories?: any[] })?.categories;
  const categoriesBlock = blocks.find(
    (block) => block.__component === 'app-components.app-category-component',
  );

  if (!categoriesBlock?.product_categories) {
    return;
  }

  categoriesBlock.product_categories = Array.isArray(categories)
    ? categoriesBlock.product_categories.filter((category) =>
        categories.some((c: any) => c.categoryId === category.categoryId),
      )
    : [];
}

function injectTopBrandsBlock(blocks: any[], categoriesResponse?: AggregatedResponse): void {
  const topBrands = (categoriesResponse?.data as { brands?: any[] })?.brands;

  if (!Array.isArray(topBrands)) {
    return;
  }

  const topBrandsBlockIndex = blocks.findIndex(
    (block) => block.__component === 'app-components.app-top-brands',
  );

  if (topBrandsBlockIndex === -1) {
    return;
  }

  const topBrandsBlock = blocks[topBrandsBlockIndex];

  const brands = Array.isArray(topBrandsBlock.product_brands)
    ? topBrandsBlock.product_brands.map((brand: any) => ({
        image: brand.image?.url || '',
        name: brand.name || '',
      }))
    : [];

  const productBrands = brands.filter((brand) => topBrands.includes(brand.name));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { product_brands, ...restOfBlock } = topBrandsBlock;

  blocks[topBrandsBlockIndex] = {
    ...restOfBlock,
    productBrands,
  };
}

function injectBlogsBlock(blocks: any[], blogResponse?: AggregatedResponse): void {
  const blogs = (blogResponse?.data as { data?: unknown })?.data;

  if (!Array.isArray(blogs)) {
    return;
  }

  const blogBlock = blocks.find(
    (block) => block.__component === 'app-components.app-blog-list-component',
  );

  if (blogBlock) {
    blogBlock.blogs = blogs;
  }
}

function hasInTransitData(inTransitResponse?: AggregatedResponse): boolean {
  const inTransitData = inTransitResponse?.data?.data?.response?.data;

  return !!(
    inTransitResponse?.success &&
    inTransitResponse.data?.success &&
    inTransitResponse.data?.data?.success &&
    Array.isArray(inTransitData) &&
    inTransitData.length > 0
  );
}

function injectInTransitBlock(blocks: any[], inTransitResponse?: AggregatedResponse): void {
  const inTransitBlock = blocks.find(
    (block) => block.__component === 'app-components.app-link-banner',
  );

  if (inTransitBlock) {
    inTransitBlock.inTransit = hasInTransitData(inTransitResponse);
  }
}

export function mergeHomePageResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = mapResponsesByTarget(aggregatedResponses);

  const strapiResponse = responses['app-home-page'];
  const topItemsResponse = responses['app-top-items'];
  const buyAgainResponse = responses['app-buy-again'];
  const categoriesResponse = responses['app-categories'];
  const blogResponse = responses['app-blogs'];
  const inTransitResponse = responses['app-in-transit'];

  safeDebug(Logger, () =>
    `Strapi Home Page Api response from method: mergeHomePageResponses : ${inspect(strapiResponse)}`,
  );
  safeDebug(Logger, () =>
    `Top Items Api response from method: mergeHomePageResponses : ${inspect(topItemsResponse)}`,
  );
  safeDebug(Logger, () =>
    `Buy Again Api response from method: mergeHomePageResponses : ${inspect(buyAgainResponse)}`,
  );
  safeDebug(Logger, () =>
    `Categories Api response from method: mergeHomePageResponses : ${inspect(categoriesResponse)}`,
  );
  safeDebug(Logger, () =>
    `Blog Api response from method: mergeHomePageResponses : ${inspect(blogResponse)}`,
  );
  safeDebug(Logger, () =>
    `In Transit Api response from method: mergeHomePageResponses : ${inspect(inTransitResponse)}`,
  );

  if (!isValidStrapiResponse(strapiResponse)) {
    Logger.error(
      `Error for Home Page API method: mergeHomePageResponses Strapi response is missing or invalid`,
    );
    return { data: {}, meta: {} };
  }

  const mergedData: Record<string, unknown> = { ...strapiResponse.data.data };
  const blocks = getBlocks(strapiResponse);

  injectBuyAgainBlock(blocks, buyAgainResponse);
  injectTopItemsBlock(blocks, topItemsResponse);
  injectCategoriesBlock(blocks, categoriesResponse);
  injectTopBrandsBlock(blocks, categoriesResponse);
  injectBlogsBlock(blocks, blogResponse);
  injectInTransitBlock(blocks, inTransitResponse);

  mergedData.blocks = blocks;

  return {
    data: mergedData,
  };
}

function getResponsesByTarget(
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

function addEmptyPriceToProducts(products?: any[]): void {
  if (!Array.isArray(products)) {
    return;
  }

  products.forEach((product: any) => {
    product.price = '';
  });
}

function applyPricesToBuyAgainProducts(products: any[], priceData: any[]): void {
  products.forEach((product: any) => {
    const priceProduct = priceData.find((p: any) => p.variantKey === product.variantKey);
    product.price = priceProduct?.displayVariantLineItemPrice || '';
  });
}

function mergePriceDataIntoRetailData(retailData: any, priceData: any): any {
  const products = retailData?.listOfBuyAgainProducts;

  if (Array.isArray(priceData) && priceData.length === 0) {
    addEmptyPriceToProducts(products);
    return retailData;
  }

  if (Array.isArray(priceData) && Array.isArray(products)) {
    applyPricesToBuyAgainProducts(products, priceData);
  }

  return retailData;
}

export function mergeBuyAgainResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = getResponsesByTarget(aggregatedResponses);

  const buyAgainPriceApiResponse = responses['ccp-buy-again-with-prices'];
  const buyAgainRetailApiResponse = responses['app-buy-again'];

  safeDebug(
    Logger,
    () =>
      ` Buy Again Price Api response from method: mergeBuyAgainResponses : ${inspect(
        buyAgainPriceApiResponse,
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      `Buy Again Retail Api response from method: mergeBuyAgainResponses : ${inspect(
        buyAgainRetailApiResponse,
      )}`,
  );

  if (!buyAgainRetailApiResponse.success) {
    Logger.error(
      `Error for Buy Again API method: mergeBuyAgainResponses Buy again retail API response failed`,
    );

    return {
      listOfBuyAgainProducts: [],
    };
  }

  if (!buyAgainPriceApiResponse.data || !buyAgainRetailApiResponse.data) {
    return undefined;
  }

  return mergePriceDataIntoRetailData(
    buyAgainRetailApiResponse.data,
    buyAgainPriceApiResponse.data,
  );
}

const TOP_BRANDS_DEFAULT_RESPONSE = {
  productBrands: [],
};

function mapBrands(productBrands?: any[]): any[] {
  if (!Array.isArray(productBrands)) {
    return [];
  }

  return productBrands.map((brand: any) => ({
    image: brand.image?.url || '',
    name: brand.name || '',
  }));
}

function buildTopBrandsResponse(topBrandsStrapiResponse: any, productBrands: any[]) {
  return {
    __component: topBrandsStrapiResponse.__component,
    id: topBrandsStrapiResponse.id,
    title: topBrandsStrapiResponse.title,
    productBrands,
  };
}

function getFirstBrandingSection(strapiTopBrandsData?: AggregatedResponse): any {
  const brandingSections = strapiTopBrandsData?.data?.data?.branding_sections;

  if (!Array.isArray(brandingSections) || brandingSections.length === 0) {
    return null;
  }

  return brandingSections[0] ?? null;
}

export function mergeTopBrandsResponses(aggregatedResponses: AggregatedResponse[]) {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const strapiTopBrandsData = responses['app-top-brands-page'];
  const topBrandsApiData = responses['app-top-brands'];

  safeDebug(
    Logger,
    () =>
      ` Strapi Top Brands Api response from method: mergeTopBrandsResponses : ${inspect(
        strapiTopBrandsData,
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      ` Top Brands Api response from method: mergeTopBrandsResponses : ${inspect(
        topBrandsApiData,
      )}`,
  );

  if (!strapiTopBrandsData.success || !topBrandsApiData.success) {
    Logger.error(
      `Error for Top Brands API method: mergeTopBrandsResponses Strapi or API data response failed`,
    );
    return TOP_BRANDS_DEFAULT_RESPONSE;
  }

  const topBrandsStrapiResponse = getFirstBrandingSection(strapiTopBrandsData);

  if (!topBrandsStrapiResponse) {
    Logger.error(
      `Error for Top Brands API method: mergeTopBrandsResponses Strapi branding sections not found or invalid`,
    );
    return TOP_BRANDS_DEFAULT_RESPONSE;
  }

  const brands = mapBrands(topBrandsStrapiResponse.product_brands);
  const topBrandsApiResponse = topBrandsApiData.data?.brands;

  if (!Array.isArray(topBrandsApiResponse) || topBrandsApiResponse.length === 0) {
    return buildTopBrandsResponse(topBrandsStrapiResponse, []);
  }

  const productBrands = brands.filter((brand) => topBrandsApiResponse.includes(brand.name));

  return buildTopBrandsResponse(topBrandsStrapiResponse, productBrands);
}

export function transformInTransitRequest(request) {
  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: null,
  };
  finalTransformedRequest.url.search = `?page=1&size=10&cursorTimestamp=0`;
  return finalTransformedRequest;
}
