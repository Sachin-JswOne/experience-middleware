import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug, safeToLog } from 'src/utils/common-functions.util';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';
import * as categoryTransformers from './category.transformers';
import {
  extractBrandCategoryIdsv3 as extractBrandCategoryIdsv3Util,
  extractCentralCatalogueCategoryIdsv3 as extractCentralCatalogueCategoryIdsv3Util,
  extractProductListingSlugv3 as extractProductListingSlugv3Util,
} from 'src/utils/central-category.util';
export {
  extractCentralCatalogueCategoryIds,
  extractCentralCatalogueCategoryIdsv3,
  getAllCentralCatalogueCategoryIds,
  getAllCentralCatalogueCategoryIdsv3,
  extractBrandCategoryIdsv3,
  extractProductListingSlugv3,
  extractBrandCategoryIds,
} from 'src/utils/central-category.util';
import * as generalTransformers from './general.transformers';
import * as cmsTransformers from './cms.transformers';
import { Request } from 'express';

const WEB_HOME_PAGE_V3_ORIGINAL_BODY_KEY = '__webHomePageV3OriginalBody';
const WEB_HOME_PAGE_V3_CMS_KEY = '__webHomePageV3CmsResponse';

export function homeBlogsFromParallelPayload(request: BaseRequest): BaseRequest {
  return cmsTransformers.homeBlogs({
    ...request,
    body: getParallelHelperOriginalBody(request),
  });
}

export function convertOriginalBodyToGetRequestFromParallelPayload(
  request: BaseRequest,
): BaseRequest {
  return generalTransformers.convertToGetRequest({
    ...request,
    body: getParallelHelperOriginalBody(request),
  });
}

function buildSyntheticHomepageCmsPrevResponses(cmsResponse: any): AggregatedResponse[] {
  return [
    {
      target: 'layout-mweb-homepages',
      success: true,
      data: {
        data: cmsResponse ? [cmsResponse] : [],
        meta: {},
      },
    } as AggregatedResponse,
  ];
}

function getParallelHelperCmsResponse(request: BaseRequest): any {
  return request?.body?.[WEB_HOME_PAGE_V3_CMS_KEY] ?? null;
}

function getParallelHelperOriginalBody(request: BaseRequest): any {
  return request?.body?.[WEB_HOME_PAGE_V3_ORIGINAL_BODY_KEY] ?? {};
}

function getHomepageV3PageFromHelperBody(request: BaseRequest): any {
  return getParallelHelperCmsResponse(request);
}

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
    cmsResponse.data !== null
  );
}

function getBlocks(cmsData: { blocks?: any[] }): any[] {
  return Array.isArray(cmsData?.blocks) ? [...cmsData.blocks] : [];
}

function injectBuyAgainData(blocks: any[], buyAgainResponse: any): void {
  if (!buyAgainResponse?.success) {
    if (buyAgainResponse) {
      Logger.warn(
        `Warning for Web Home Page API method: mergeWebHomePageResponses CCP buy again response failed.`,
        buyAgainResponse.error ?? 'Unknown error',
      );
    }
    return;
  }

  const rawData = buyAgainResponse.data ?? {};
  const { listOfBuyAgainProducts, variantList, skuSize } = rawData;
  const products = listOfBuyAgainProducts ?? variantList ?? (Array.isArray(rawData) ? rawData : []);

  if (products.length === 0) {
    return;
  }

  const block = blocks.find(
    (b: any) => b.type === 'buy-again' || b.__component === 'app-components.app-buy-again',
  );

  if (!block) {
    return;
  }

  block.listOfBuyAgainProducts = products;
  if (variantList) block.variantList = variantList;
  if (skuSize != null) block.skuSize = skuSize;
}

function injectBlogs(blocks: any[], blogsResponse?: AggregatedResponse): void {
  const blogs = blogsResponse?.data?.data || [];
  const blogsBlock = blocks.find(
    (block: any) =>
      block.type === 'blogs' || block.__component === 'app-components.app-blog-list-component',
  );

  if (blogsBlock) {
    blogsBlock.blogs = blogs;
  }
}

function getNavigation(response?: AggregatedResponse): any[] | null {
  return response?.success && Array.isArray(response.data?.data?.navigation)
    ? response.data.data.navigation
    : null;
}

function filterNavigationByCategoryIds(navigation: any[], categoryIds: string[]): any[] {
  return navigation
    .map((nav: any) => ({
      ...nav,
      subMenu: nav.subMenu?.filter((sub: any) => categoryIds.includes(sub.id)),
    }))
    .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);
}

function injectCentralCategoryData(
  blocks: any[],
  navigation: any[] | null,
  componentName: string,
): void {
  if (!navigation) {
    return;
  }

  const categoryBlocks = blocks.filter(
    (block: any) =>
      block.__component === componentName &&
      Array.isArray(block.web_central_catalogue_categories),
  );

  categoryBlocks.forEach((block: any) => {
    const blockCategoryIds = block.web_central_catalogue_categories
      .map((category: any) => category.categoryId)
      .filter(Boolean);

    block.centralCategoryIdData = filterNavigationByCategoryIds(navigation, blockCategoryIds);
  });
}

function injectPendingDispatchQuantity(
  mergedData: Record<string, unknown>,
  pendingDispatchResponse?: AggregatedResponse,
): void {
  if (pendingDispatchResponse?.success) {
    mergedData.pendingDispatchQuantity = pendingDispatchResponse.data;
    return;
  }

  if (pendingDispatchResponse) {
    Logger.warn(
      `Warning for Web Home Page API method: mergeWebHomePageResponses pending-dispatch-quantity response failed.`,
      pendingDispatchResponse.error ?? 'Unknown error',
    );
  }
}

function getProductCategoryBlock(blocks: any[]): any {
  return blocks.find((block: any) => block.__component === 'app-components.app-product-category');
}

function injectWebProducts(blocks: any[], webProductsResponse?: AggregatedResponse): void {
  if (!webProductsResponse?.success) {
    return;
  }

  const productsData = webProductsResponse.data.data ?? {};
  const block = getProductCategoryBlock(blocks);

  block?.app_product_categories
    ?.filter((categoryProducts: any) => categoryProducts.webCategoryId && categoryProducts.itemsToShow)
    .forEach((categoryProducts: any) => {
      categoryProducts.productsList = productsData[categoryProducts.webCategoryId];
    });
}

function injectProductsListing(blocks: any[], productsListingResponse?: AggregatedResponse): void {
  if (
    !productsListingResponse?.success ||
    !Array.isArray(productsListingResponse.data?.data?.products)
  ) {
    return;
  }

  const block = getProductCategoryBlock(blocks);
  const filteredCategories = block?.app_product_categories?.filter(
    (categoryProducts: any) => categoryProducts.webCategoryId && categoryProducts.itemsToShow,
  );

  if (!filteredCategories?.length) {
    return;
  }

  filteredCategories[0].centralCategoryIdData = [
    {
      products: productsListingResponse.data.data.products,
    },
  ];
}

function buildWebHomePageResponse(mergedData: Record<string, unknown>, blocks: any[]): any {
  mergedData.blocks = blocks;

  return {
    data: mergedData,
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };
}

export function mergeWebHomePageResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = mapResponsesByTarget(aggregatedResponses);

  const cmsResponse = responses['app-home-page'];
  const blogsResponse = responses['app-blogs'];
  const buyAgainResponse = responses['ccp-buy-again-with-prices']?.data;
  const pendingDispatchResponse = responses['pending-dispatch-quantity'];
  const webProductsResponse = responses['web-homepage-products'];
  const webCentralCatalogueResponse = responses['web-central-catalogue-categories'];
  const webTopBrandCategoriesResponse = responses['web-central-top-brand-categories'];
  const productsListingResponse = responses['products-listing'];

  safeDebug(Logger, () =>
    ` CMS Home Page Api response from method: mergeWebHomePageResponses : ${JSON.stringify(
      cmsResponse,
    )}`,
  );
  safeDebug(Logger, () =>
    ` Blogs Api response from method: mergeWebHomePageResponses : ${JSON.stringify(
      blogsResponse,
    )}`,
  );
  safeDebug(Logger, () =>
    ` CCP Buy Again With Price Api response from method: mergeWebHomePageResponses : ${JSON.stringify(
      buyAgainResponse,
    )}`,
  );
  safeDebug(Logger, () =>
    ` Pending Dispatch Quantity Api response from method: mergeWebHomePageResponses : ${JSON.stringify(
      pendingDispatchResponse,
    )}`,
  );

  if (!isValidCmsResponse(cmsResponse)) {
    Logger.error(
      `Error for Web Home Page API method: mergeWebHomePageResponses CMS response is missing or invalid.`,
    );
    return { data: {}, meta: {} };
  }

  const cmsData = cmsResponse.data.data as { blocks?: any[] };
  const mergedData: Record<string, unknown> = { ...cmsData };
  const blocks = getBlocks(cmsData);

  injectBuyAgainData(blocks, buyAgainResponse);
  injectBlogs(blocks, blogsResponse);

  injectCentralCategoryData(
    blocks,
    getNavigation(webCentralCatalogueResponse),
    'app-components.app-category-component',
  );

  injectCentralCategoryData(
    blocks,
    getNavigation(webTopBrandCategoriesResponse),
    'app-components.app-top-brands',
  );

  injectPendingDispatchQuantity(mergedData, pendingDispatchResponse);
  injectWebProducts(blocks, webProductsResponse);
  injectProductsListing(blocks, productsListingResponse);

  return buildWebHomePageResponse(mergedData, blocks);
}

export function transformCategoryToFilterRequest(categoryData: {
  webCategoryId: string;
  itemsToShow: number;
}): {
  offSet: number;
  limit: number;
  categoryId: string;
  filterConditions: any[];
  directOrderProducts: boolean;
} {
  return {
    offSet: 1,
    limit: categoryData.itemsToShow,
    categoryId: categoryData.webCategoryId,
    filterConditions: [],
    directOrderProducts: false,
  };
}

export function catlougeByCategories(
  request: BaseRequest,
  aggregatedResponses: AggregatedResponse[],
): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
  };

  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const categoriesResponse = responses['app-categories'];

  if (!categoriesResponse?.success) {
    Logger.error(`Error from Strapi for categories response`, categoriesResponse.error);
    throw new CustomError(
      categoriesResponse.downstreamResponse,
      categoriesResponse.httpStatus ?? 500,
    );
  }

  const categories = categoriesResponse.data.data;

  // Remove duplicates based on webCategoryId
  const uniqueCategories = Array.from(
    new Map(
      categories
        .filter((category: any) => category.webCategoryId && category.itemsToShow > 0)
        .map((category: any) => [category.webCategoryId, category]),
    ).values(),
  );

  const filterRequests = uniqueCategories.map((category: any) => {
    return transformCategoryToFilterRequest(category);
  });

  transformedRequest.body = filterRequests;

  return transformedRequest;
}

export function handleProductResponse(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
  const productsResponse = responses['catlouge-by-categories'];

  if (!productsResponse?.success) {
    Logger.error(`Error from Strapi for categories response`, productsResponse.error);
    throw new CustomError(productsResponse.downstreamResponse, productsResponse.httpStatus ?? 500);
  }

  Object.values(productsResponse.data).forEach(
    (catProductData: any) => delete catProductData.filterConditions,
  );

  return productsResponse;
}

function buildCompactWebHomePageV3Payload(cmsResponse: any) {
  const page = Array.isArray(cmsResponse?.data) ? cmsResponse.data[0] : null;

  if (!page) return null;

  return {
    mweb_top_item: page?.mweb_top_item ?? null,
    product_category_component: Array.isArray(page?.product_category_component)
      ? page.product_category_component
      : [],
    industry_specific_components: Array.isArray(page?.industry_specific_components)
      ? page.industry_specific_components
      : [],
    category_component: page?.category_component ?? null,
    top_brand_component: page?.top_brand_component ?? null,
    blog_list_component_material_matter: page?.blog_list_component_material_matter ?? null,
    buy_again_component: page?.buy_again_component ?? null,
    recently_viewed_component: page?.recently_viewed_component ?? null,
  };
}

export function prepareWebHomePageV3ParallelPayload(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  const cmsAgg = prevResponses.find((r) => r.target === 'layout-mweb-homepages');
  const compactCms = buildCompactWebHomePageV3Payload(cmsAgg?.data);

  return {
    ...request,
    body: {
      [WEB_HOME_PAGE_V3_ORIGINAL_BODY_KEY]: request.body ?? {},
      [WEB_HOME_PAGE_V3_CMS_KEY]: compactCms,
    },
  };
}

export function mergeWebHomePageResponsesV3FromNestedParallel(
  aggregatedResponses: AggregatedResponse[],
): any {
  const cmsAgg = aggregatedResponses.find((r) => r.target === 'layout-mweb-homepages');

  const helperAgg = aggregatedResponses.find((r) => r.target?.includes('parallel-helper'));

  if (!helperAgg) {
    throw new CustomError('web-home-page-v3 parallel helper response missing', 500);
  }

  if (!helperAgg.success) {
    Logger.error(
      `web-home-page-v3 parallel helper failed: ${safeToLog(helperAgg.error)} | downstream=${safeToLog(
        helperAgg.downstreamResponse,
      )}`,
    );

    throw new CustomError(
      `web-home-page-v3 parallel helper failed: ${helperAgg.error ?? 'unknown error'}`,
      helperAgg.httpStatus ?? 500,
    );
  }

  if (!Array.isArray(helperAgg.data)) {
    Logger.error(
      `web-home-page-v3 parallel helper returned non-array data: ${safeToLog(helperAgg.data)}`,
    );
    throw new CustomError('web-home-page-v3 parallel helper returned non-array data', 500);
  }

  const helperResponses = helperAgg.data;

  return mergeWebHomePageResponsesV3([
    ...(cmsAgg ? [cmsAgg] : []),
    ...helperResponses,
  ]);
}

export function addFeatureFlagQueryParamsFromParallelPayload(request: BaseRequest): BaseRequest {
  return categoryTransformers.addFeatureFlagQueryParams({
    ...request,
    body: getParallelHelperOriginalBody(request),
  });
}

export function transformWebHomePageTopItemsMMIDRequestV3FromCmsBody(
  request: BaseRequest,
): BaseRequest {
  const page0 = getHomepageV3PageFromHelperBody(request);
  let mmids: string[] = [];

  try {
    const items = page0?.mweb_top_item?.app_search_top_items ?? [];
    mmids = Array.from(new Set(extractMMIDs(items)));
  } catch (e) {
    Logger.warn(
      `transformWebHomePageTopItemsMMIDRequestV3FromCmsBody: MMID extraction failed → ${safeToLog(
        e,
      )}`,
    );
  }

  return {
    ...request,
    body: mmids,
  };
}

export function extractBrandCategoryIdsv3FromCmsBody(request: BaseRequest): BaseRequest {
  const cmsResponse = getParallelHelperCmsResponse(request);

  return extractBrandCategoryIdsv3Util(
    request,
    buildSyntheticHomepageCmsPrevResponses(cmsResponse),
  );
}

export function extractCentralCatalogueCategoryIdsv3FromCmsBody(request: BaseRequest): BaseRequest {
  const cmsResponse = getParallelHelperCmsResponse(request);

  return extractCentralCatalogueCategoryIdsv3Util(
    request,
    buildSyntheticHomepageCmsPrevResponses(cmsResponse),
  );
}

export function extractProductListingSlugv3FromCmsBody(request: BaseRequest): BaseRequest {
  const cmsResponse = getParallelHelperCmsResponse(request);

  return extractProductListingSlugv3Util(
    request,
    buildSyntheticHomepageCmsPrevResponses(cmsResponse),
  );
}

export function extractMMIDs(items: any[]): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => item?.MMID)
    .filter((mmid): mmid is string => typeof mmid === 'string' && mmid.length > 0);
}

export function transformWebHomePageTopItemsMMIDRequestV3(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  const buyAgainAgg = prevResponses.find((r) => r.target === 'ccp-buy-again-with-prices');
  const list =
    buyAgainAgg?.data?.data?.listOfBuyAgainProducts ?? buyAgainAgg?.data?.listOfBuyAgainProducts;

  const hasBuyAgainData = Array.isArray(list) && list.length > 0;

  if (hasBuyAgainData) {
    return { ...request, body: [] };
  }
  const cmsAgg = prevResponses.find((r) => r.target === 'layout-mweb-homepages');

  let mmids: string[] = [];

  try {
    const page0 = cmsAgg?.data?.data?.[0];
    const items = page0?.mweb_top_item?.app_search_top_items ?? [];
    mmids = extractMMIDs(items);
  } catch (e) {
    Logger.warn(
      `transformWebHomePageTopItemsMMIDRequestV3: MMID extraction failed → ${safeToLog(e)}`,
    );
  }

  mmids = Array.from(new Set(mmids));

  // CCP expects RAW ARRAY
  return {
    ...request,
    body: mmids,
  };
}

function getV3Responses(
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

function isValidV3CmsResponse(cmsResponse?: AggregatedResponse): boolean {
  return !!(
    cmsResponse?.success &&
    typeof cmsResponse.data === 'object' &&
    cmsResponse.data !== null &&
    Array.isArray((cmsResponse.data as any)?.data)
  );
}

function injectV3Blogs(page: any, blogsResponse?: AggregatedResponse): void {
  if (page.blog_list_component_material_matter) {
    page.blog_list_component_material_matter.blogs = blogsResponse?.data?.data || [];
  }
}

function injectV3BuyAgain(page: any, buyAgainAgg?: AggregatedResponse): void {
  if (!buyAgainAgg?.success) {
    if (buyAgainAgg) {
      Logger.warn(
        `Warning for Web Home Page API method: mergeWebHomePageResponsesV3 CCP buy again response failed.`,
        buyAgainAgg.error ?? 'Unknown error',
      );
    }
    return;
  }

  const rawData = buyAgainAgg.data?.data ?? buyAgainAgg.data ?? {};
  const { listOfBuyAgainProducts, variantList, skuSize } = rawData;
  const products = listOfBuyAgainProducts ?? variantList ?? (Array.isArray(rawData) ? rawData : []);

  if (!page.buy_again_component || !Array.isArray(products) || products.length === 0) {
    return;
  }

  page.buy_again_component.listOfBuyAgainProducts = products;
  if (variantList) page.buy_again_component.variantList = variantList;
  if (skuSize != null) page.buy_again_component.skuSize = skuSize;
}

function deleteTopItemProductDetails(mwebTopItem: any): void {
  if ('top_items_product_details' in mwebTopItem) {
    delete mwebTopItem.top_items_product_details;
  }
}

function injectV3TopItems(page: any, responses: Record<string, AggregatedResponse>): void {
  if (!page?.mweb_top_item || !Array.isArray(page.mweb_top_item.app_search_top_items)) {
    return;
  }

  const buyAgainList = page?.buy_again_component?.listOfBuyAgainProducts;
  const hasBuyAgainData = Array.isArray(buyAgainList) && buyAgainList.length > 0;

  if (hasBuyAgainData) {
    page.mweb_top_item.isTopItem = false;
    deleteTopItemProductDetails(page.mweb_top_item);
    return;
  }

  page.mweb_top_item.isTopItem = true;

  const topItemsCcpResponse = responses['ccp-top-items-product-details'];
  const ccpProducts = topItemsCcpResponse?.success
    ? topItemsCcpResponse.data?.data?.products ?? topItemsCcpResponse.data?.products ?? []
    : null;

  if (!Array.isArray(ccpProducts) || ccpProducts.length === 0) {
    safeDebug(Logger, () => `Top Items: CCP empty/fail; keeping CMS top items as-is.`);
    return;
  }

  const productMap = new Map<string, any>(
    ccpProducts
      .filter((p: any) => typeof p?.product_mmid === 'string' && p.product_mmid.length > 0)
      .map((p: any) => [p.product_mmid, p]),
  );

  page.mweb_top_item.app_search_top_items = page.mweb_top_item.app_search_top_items.map(
    (cmsItem: any) => mapV3TopItem(cmsItem, productMap),
  );

  deleteTopItemProductDetails(page.mweb_top_item);
}

function mapV3TopItem(cmsItem: any, productMap: Map<string, any>): any {
  const mmid = cmsItem?.MMID;

  if (typeof mmid !== 'string' || !mmid) {
    return cmsItem;
  }

  const product = productMap.get(mmid);

  if (!product) {
    safeDebug(Logger, () => `Top Items: MMID not found in CCP → ${safeToLog(mmid)}`);
    return cmsItem;
  }

  const newTitle = product.attributes?.product_title;
  const newWebUrl = product.attributes?.slug;
  const newMmid = product.product_mmid;
  const newImageUrl = product.meta_data?.product_media?.[0]?.public_url;

  return {
    ...cmsItem,
    title: typeof newTitle === 'string' ? newTitle : cmsItem.title,
    webUrl: typeof newWebUrl === 'string' ? newWebUrl : cmsItem.webUrl,
    MMID: typeof newMmid === 'string' ? newMmid : cmsItem.MMID,
    image: {
      ...(cmsItem.image ?? {}),
      url: typeof newImageUrl === 'string' ? newImageUrl : cmsItem?.image?.url,
    },
  };
}

function injectV3PendingDispatch(
  mergedWrapper: any,
  pendingDispatchResponse?: AggregatedResponse,
): void {
  if (pendingDispatchResponse?.success) {
    mergedWrapper.pendingDispatchQuantity = pendingDispatchResponse.data;
    return;
  }

  if (pendingDispatchResponse) {
    Logger.warn(
      `Warning for Web Home Page API method: mergeWebHomePageResponsesV3 pending-dispatch-quantity response failed.`,
      pendingDispatchResponse.error ?? 'Unknown error',
    );
  }
}

function convertV3ProductCategories(components: any): void {
  if (!Array.isArray(components)) {
    return;
  }

  for (const comp of components) {
    if (comp?.product_categories && !comp.app_product_categories) {
      comp.app_product_categories = comp.product_categories;
      delete comp.product_categories;
    }
  }
}

function injectV3ProductsList(blocks: any[], productsData: any): void {
  console.log('injectV3ProductsList', { productsData });
  for (const block of blocks) {
    block?.app_product_categories
      ?.filter((c: any) => c.webCategoryId && c.itemsToShow)
      ?.forEach((c: any) => {
        c.productsList = productsData[c.webCategoryId];
      });
  }
}

function injectV3ProductsListing(blocks: any[], listingResponse?: AggregatedResponse): void {
  if (!listingResponse?.success || !Array.isArray(listingResponse.data?.data?.products)) {
    return;
  }

  for (const block of blocks) {
    const filteredCategories = block?.app_product_categories?.filter(
      (c: any) => c.webCategoryId && c.itemsToShow,
    );

    if (filteredCategories?.length > 0) {
      filteredCategories[0].centralCategoryIdData = [{ products: listingResponse.data.data.products }];
    }
  }
}

function injectV3WebProducts(
  page: any,
  webProductsResponse?: AggregatedResponse,
  productsListingResponse?: AggregatedResponse,
  industryProductsListingResponse?: AggregatedResponse,
): void {
  if (!webProductsResponse?.success) {
    return;
  }

  const productsData = webProductsResponse.data?.data ?? {};
  const productCategoryBlocks = Array.isArray(page.product_category_component)
    ? page.product_category_component
    : [];
  const industrySpecificBlocks = Array.isArray(page.industry_specific_components)
    ? page.industry_specific_components
    : [];

  injectV3ProductsList(productCategoryBlocks, productsData);
  injectV3ProductsListing(productCategoryBlocks, productsListingResponse);

  injectV3ProductsList(industrySpecificBlocks, productsData);
  injectV3ProductsListing(industrySpecificBlocks, industryProductsListingResponse);
}

function getV3Navigation(response?: AggregatedResponse): any[] | null {
  return response?.success && Array.isArray(response.data?.data?.navigation)
    ? response.data.data.navigation
    : null;
}

function buildV3CentralCategoryIdData(navigation: any[], categories: any[]): any[] {
  const blockCategoryIds = categories.map((c: any) => c.categoryId).filter(Boolean);

  return navigation
    .map((nav: any) => ({
      ...nav,
      subMenu: nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)),
    }))
    .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);
}

function injectV3CentralCategoryComponent(page: any, response?: AggregatedResponse): void {
  const navigation = getV3Navigation(response);

  if (!navigation || !Array.isArray(page.category_component?.web_central_catalogue_categories)) {
    return;
  }

  page.category_component.centralCategoryIdData = buildV3CentralCategoryIdData(
    navigation,
    page.category_component.web_central_catalogue_categories,
  );
}

function injectV3TopBrandComponent(page: any, response?: AggregatedResponse): void {
  const navigation = getV3Navigation(response);

  if (!navigation || !Array.isArray(page.top_brand_component?.web_central_catalogue_categories)) {
    return;
  }

  page.top_brand_component.centralCategoryIdData = buildV3CentralCategoryIdData(
    navigation,
    page.top_brand_component.web_central_catalogue_categories,
  );
}

function getV3RemovedMmids(recentViewedRemoveAgg?: AggregatedResponse): string[] {
  if (recentViewedRemoveAgg?.success && recentViewedRemoveAgg.data?.data?.removeProduct) {
    return recentViewedRemoveAgg.data.data.removeProduct;
  }

  if (recentViewedRemoveAgg) {
    Logger.warn(
      `Warning for Web Home Page API method: mergeWebHomePageResponsesV3 recent-viewed-remove response failed.`,
      recentViewedRemoveAgg.error ?? 'Unknown error',
    );
  }

  return [];
}

function getV3RecentlyViewedProducts(recentlyViewedDetailsAgg?: AggregatedResponse): RecentlyViewedProduct[] {
  if (recentlyViewedDetailsAgg?.success) {
    return normalizeRecentlyViewedProducts(recentlyViewedDetailsAgg.data as any);
  }

  if (recentlyViewedDetailsAgg) {
    Logger.warn(
      `Warning for Web Home Page API method: mergeWebHomePageResponsesV3 recently-viewed-product-details response failed.`,
      recentlyViewedDetailsAgg.error ?? 'Unknown error',
    );
  }

  return [];
}

function injectV3RecentlyViewed(
  page: any,
  recentlyViewedDetailsAgg?: AggregatedResponse,
  recentViewedRemoveAgg?: AggregatedResponse,
): void {
  if (!page.recently_viewed_component) {
    return;
  }

  const removedMmids = getV3RemovedMmids(recentViewedRemoveAgg);
  const recentlyViewedProducts = getV3RecentlyViewedProducts(recentlyViewedDetailsAgg);

  page.recently_viewed_component.recentlyViewedProducts = recentlyViewedProducts.filter(
    (product) => !removedMmids.includes(product.mmid),
  );
  page.recently_viewed_component.removedMmids = removedMmids;
}

export function mergeWebHomePageResponsesV3(aggregatedResponses: AggregatedResponse[]): any {
  const responses = getV3Responses(aggregatedResponses);

  const cmsResponse = responses['layout-mweb-homepages'] ?? responses['app-home-page'];
  const blogsResponse = responses['app-blogs'];
  const buyAgainAgg = responses['ccp-buy-again-with-prices'];
  const pendingDispatchResponse = responses['pending-dispatch-quantity'];
  const webProductsResponse = responses['web-homepage-products'];
  const webCentralCatalogueResponse = responses['web-central-catalogue-categories'];
  const webTopBrandCategoriesResponse = responses['web-central-top-brand-categories'];
  const productsListingResponse = responses['products-listing'];
  const industryProductsListingResponse = responses['industry-products-listing'];

  safeDebug(Logger, () =>
    `CMS Api response from method: mergeWebHomePageResponsesV3 : ${safeToLog(cmsResponse)}`,
  );
  safeDebug(Logger, () =>
    `Blogs Api response from method: mergeWebHomePageResponsesV3 : ${safeToLog(blogsResponse)}`,
  );
  safeDebug(Logger, () =>
    `Buy Again Api response from method: mergeWebHomePageResponsesV3 : ${safeToLog(buyAgainAgg)}`,
  );
  safeDebug(Logger, () =>
    `Pending Dispatch Api response from method: mergeWebHomePageResponsesV3 : ${safeToLog(
      pendingDispatchResponse,
    )}`,
  );

  if (!isValidV3CmsResponse(cmsResponse)) {
    Logger.error(
      `Error for Web Home Page API method: mergeWebHomePageResponsesV3 CMS response is missing or invalid.`,
    );
    return { data: [], meta: {} };
  }

  const cmsPayload = cmsResponse.data as any;
  const mergedWrapper: any = {
    data: JSON.parse(JSON.stringify(cmsPayload.data ?? [])),
    meta: cmsPayload.meta ?? {},
  };

  if (!mergedWrapper.data.length) {
    return mergedWrapper;
  }

  const page = mergedWrapper.data[0];

  injectV3Blogs(page, blogsResponse);
  injectV3BuyAgain(page, buyAgainAgg);
  injectV3TopItems(page, responses);
  injectV3PendingDispatch(mergedWrapper, pendingDispatchResponse);

  convertV3ProductCategories(page.product_category_component);
  convertV3ProductCategories(page.industry_specific_components);

  injectV3WebProducts(
    page,
    webProductsResponse,
    productsListingResponse,
    industryProductsListingResponse,
  );

  injectV3CentralCategoryComponent(page, webCentralCatalogueResponse);
  injectV3TopBrandComponent(page, webTopBrandCategoriesResponse);

  injectV3RecentlyViewed(
    page,
    responses['recently-viewed-product-details'],
    responses['recent-viewed-remove'],
  );

  return mergedWrapper;
}
export interface RecentlyViewedProduct {
  mmid: string;
  productTitle: string;
  imageUrl: string;
  productSlug: string;
}

// ─── Normalizer ────────────────────────────────────────────────────────────

/** Transform the Central Catalogue API response into display-ready shape */
export function normalizeRecentlyViewedProducts(response: any): RecentlyViewedProduct[] {
  const items: any[] = response?.data?.products ?? [];

  return items
    .map((item) => ({
      mmid: item.product_mmid ?? '',
      productTitle: item.attributes?.product_title ?? '',
      imageUrl: item.meta_data?.product_media?.[0]?.public_url ?? '',
      productSlug: item.attributes?.slug ?? '',
    }))
    .filter((p) => p.mmid && p.productSlug);
}

// ─── Request Transformer ───────────────────────────────────────────────────

export function transformRecentlyViewedMMIDsRequestFromParallelPayload(
  request: BaseRequest,
): BaseRequest {
  return transformRecentlyViewedMMIDsRequest({
    ...request,
    body: getParallelHelperOriginalBody(request),
  });
}

export function transformRecentlyViewedMMIDsRequest(request: BaseRequest): BaseRequest {
  let mmids: string[] = [];

  try {
    if (request.body && Array.isArray((request.body as any).recentlyViewedMmids)) {
      mmids = (request.body as any).recentlyViewedMmids;
    } else if (request.body && Array.isArray((request.body as any).mmids)) {
      mmids = (request.body as any).mmids;
    } else if (Array.isArray(request.body)) {
      mmids = request.body;
    }
  } catch (e) {
    Logger.warn(`transformRecentlyViewedMMIDsRequest: Failed to extract MMIDs → ${String(e)}`);
  }

  // Ensure unique MMIDs just in case
  mmids = Array.from(new Set(mmids));

  if (mmids.length === 0) {
    // Throwing an error here prevents the downstream API call.
    // The parallel aggregator will capture this as a soft failure
    // ({ success: false, error: ... }) and the merge function will handle it gracefully.
    throw new CustomError('No MMIDs provided, skipping recently-viewed API call', 400);
  }

  return {
    ...request,
    body: mmids,
  };
}

export function selectWebHomePageV3TargetByUserType(req: Request): string {
  const userType = String(req.headers?.['user-type'] ?? '').toUpperCase();

  if (userType === 'G') {
    return 'web-home-page-v3-guest';
  } else if (userType === 'R') {
    return 'web-home-page-v3-registered';
  } else throw new CustomError(`Invalid or missing user-type header: ${userType}`, 400);
}
