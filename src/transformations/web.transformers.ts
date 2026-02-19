import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug, safeToLog } from 'src/utils/common-functions.util';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';
export {
  extractCentralCatalogueCategoryIds,
  extractCentralCatalogueCategoryIdsv3,
  getAllCentralCatalogueCategoryIds,
  getAllCentralCatalogueCategoryIdsv3,
  extractBrandCategoryIds,
  extractProductListingSlug,
  extractBrandCategoryIdsv3,
  extractProductListingSlugv3,
} from 'src/utils/central-category.util';

export function mergeWebHomePageResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const cmsResponse = responses['app-home-page'];
  const blogsResponse = responses['app-blogs'];
  const buyAgainResponse = responses['ccp-buy-again-with-prices']?.data;
  const pendingDispatchResponse = responses['pending-dispatch-quantity'];
  const webProductsResponse = responses['web-homepage-products'];
  const webCentralCatalogueResponse = responses['web-central-catalogue-categories'];
  const webTopBrandCategoriesResponse = responses['web-central-top-brand-categories'];
  const productsListingResponse = responses['products-listing'];

  safeDebug(
    Logger,
    () =>
      ` CMS Home Page Api response from method: mergeWebHomePageResponses : ${JSON.stringify(
        cmsResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      ` Blogs Api response from method: mergeWebHomePageResponses : ${JSON.stringify(
        blogsResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      ` CCP Buy Again With Price Api response from method: mergeWebHomePageResponses : ${JSON.stringify(
        buyAgainResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      ` Pending Dispatch Quantity Api response from method: mergeWebHomePageResponses : ${JSON.stringify(
        pendingDispatchResponse,
      )}`,
  );
  if (
    !cmsResponse ||
    !cmsResponse.success ||
    typeof cmsResponse.data !== 'object' ||
    cmsResponse.data === null
  ) {
    Logger.error(
      `Error for Web Home Page API method: mergeWebHomePageResponses CMS response is missing or invalid.`,
    );
    return { data: {}, meta: {} };
  }

  // Clone CMS data as base structure
  const mergedData: Record<string, unknown> = {
    ...cmsResponse.data.data,
  };

  // Extract blocks from CMS
  const cmsData = cmsResponse.data.data as {
    blocks?: any[];
  };

  const blocks: any[] = Array.isArray(cmsData?.blocks) ? [...cmsData.blocks] : [];

  // Inject buy again data
  if (buyAgainResponse?.success) {
    const rawData = buyAgainResponse.data ?? {};
    const { listOfBuyAgainProducts, variantList, skuSize } = rawData;

    const products =
      listOfBuyAgainProducts ?? variantList ?? (Array.isArray(rawData) ? rawData : []);

    if (products.length > 0) {
      const block = blocks.find(
        (b: any) => b.type === 'buy-again' || b.__component === 'app-components.app-buy-again',
      );

      if (block) {
        block.listOfBuyAgainProducts = products;
        if (variantList) block.variantList = variantList;
        if (skuSize != null) block.skuSize = skuSize;
      }
    }
  } else if (buyAgainResponse && !buyAgainResponse.success) {
    Logger.warn(
      `Warning for Web Home Page API method: mergeWebHomePageResponses CCP buy again response failed.`,
      buyAgainResponse.error ?? 'Unknown error',
    );
  }

  // Inject blogs
  const blogs = blogsResponse?.data?.data || [];
  const blogsBlock = blocks.find(
    (block: any) =>
      block.type === 'blogs' || block.__component === 'app-components.app-blog-list-component',
  );
  if (blogsBlock) {
    blogsBlock.blogs = blogs;
  }

  // // inject central catalogue categories
  if (
    webCentralCatalogueResponse?.success &&
    Array.isArray(webCentralCatalogueResponse.data?.data?.navigation)
  ) {
    const navigation = webCentralCatalogueResponse.data.data.navigation;

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

      block.centralCategoryIdData = navigation
        .map((nav: any) => ({
          ...nav,
          subMenu: nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)),
        }))
        .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);
    }
  }

  // inject top brand categories data into app-top-brands blocks
  if (
    webTopBrandCategoriesResponse?.success &&
    Array.isArray(webTopBrandCategoriesResponse.data?.data?.navigation)
  ) {
    const topBrandNavigation = webTopBrandCategoriesResponse.data.data.navigation;

    const topBrandsBlocks = blocks.filter(
      (b: any) =>
        b.__component === 'app-components.app-top-brands' &&
        Array.isArray(b.web_central_catalogue_categories),
    );

    for (const block of topBrandsBlocks) {
      const blockCategoryIds = block.web_central_catalogue_categories
        .map((c: any) => c.categoryId)
        .filter(Boolean);

      block.centralCategoryIdData = topBrandNavigation
        .map((nav: any) => ({
          ...nav,
          subMenu: nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)),
        }))
        .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);
    }
  }

  // Inject pending dispatch quantity data
  if (pendingDispatchResponse?.success) {
    mergedData.pendingDispatchQuantity = pendingDispatchResponse.data;
  } else if (pendingDispatchResponse && !pendingDispatchResponse.success) {
    Logger.warn(
      `Warning for Web Home Page API method: mergeWebHomePageResponses pending-dispatch-quantity response failed.`,
      pendingDispatchResponse.error ?? 'Unknown error',
    );
  }

  if (webProductsResponse?.success) {
    const productsData = webProductsResponse.data.data ?? {};
    const block = blocks.find((b: any) => b.__component === 'app-components.app-product-category');
    block?.app_product_categories
      ?.filter((categoryProducts) => categoryProducts.webCategoryId && categoryProducts.itemsToShow)
      .map(
        (categoryProducts) =>
          (categoryProducts.productsList = productsData[categoryProducts.webCategoryId]),
      );

    // // Inject central catalogue category data for app-product-category blocks
    if (
      productsListingResponse?.success &&
      Array.isArray(productsListingResponse.data?.data?.products)
    ) {
      const productsArray = productsListingResponse.data.data.products;

      const filteredCategories = block?.app_product_categories?.filter(
        (categoryProducts: any) => categoryProducts.webCategoryId && categoryProducts.itemsToShow,
      );

      if (filteredCategories && filteredCategories.length > 0) {
        filteredCategories[0].centralCategoryIdData = [
          {
            products: productsArray,
          },
        ];
      }
    }
  }

  // Update merged data with blocks
  mergedData.blocks = blocks;

  return {
    data: mergedData,
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };
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

  if (!categoriesResponse || !categoriesResponse.success) {
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

  if (!productsResponse || !productsResponse.success) {
    Logger.error(`Error from Strapi for categories response`, productsResponse.error);
    throw new CustomError(productsResponse.downstreamResponse, productsResponse.httpStatus ?? 500);
  }

  Object.values(productsResponse.data).forEach(
    (catProductData: any) => delete catProductData.filterConditions,
  );

  return productsResponse;
}

export function mergeWebHomePageResponsesV3(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const cmsResponse = responses['layout-mweb-homepages'] ?? responses['app-home-page']; // fallback (optional)

  const blogsResponse = responses['app-blogs'];
  const buyAgainAgg = responses['ccp-buy-again-with-prices'];
  const pendingDispatchResponse = responses['pending-dispatch-quantity'];
  const webProductsResponse = responses['web-homepage-products'];
  const webCentralCatalogueResponse = responses['web-central-catalogue-categories'];
  const webTopBrandCategoriesResponse = responses['web-central-top-brand-categories'];
  const productsListingResponse = responses['products-listing'];
  const industryProductsListingResponse = responses['industry-products-listing'];

  safeDebug(
    Logger,
    () => `CMS Api response from method: mergeWebHomePageResponsesV3 : ${safeToLog(cmsResponse)}`,
  );
  safeDebug(
    Logger,
    () =>
      `Blogs Api response from method: mergeWebHomePageResponsesV3 : ${safeToLog(blogsResponse)}`,
  );
  safeDebug(
    Logger,
    () =>
      `Buy Again Api response from method: mergeWebHomePageResponsesV3 : ${safeToLog(buyAgainAgg)}`,
  );
  safeDebug(
    Logger,
    () =>
      `Pending Dispatch Api response from method: mergeWebHomePageResponsesV3 : ${safeToLog(
        pendingDispatchResponse,
      )}`,
  );

  // Validate CMS
  if (
    !cmsResponse ||
    !cmsResponse.success ||
    typeof cmsResponse.data !== 'object' ||
    cmsResponse.data === null ||
    !Array.isArray((cmsResponse.data as any)?.data)
  ) {
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

  /**
   * Inject Blogs into blog_list_component_material_matter.blogs
   */
  const blogs = blogsResponse?.data?.data || [];
  if (page.blog_list_component_material_matter) {
    page.blog_list_component_material_matter.blogs = blogs;
  }

  /**
   * 2) Inject Buy Again into buy_again_component
   */
  if (buyAgainAgg?.success) {
    const rawData = buyAgainAgg.data?.data ?? buyAgainAgg.data ?? {};
    const { listOfBuyAgainProducts, variantList, skuSize } = rawData;

    const products =
      listOfBuyAgainProducts ?? variantList ?? (Array.isArray(rawData) ? rawData : []);

    if (page.buy_again_component && Array.isArray(products) && products.length > 0) {
      page.buy_again_component.listOfBuyAgainProducts = products;
      if (variantList) page.buy_again_component.variantList = variantList;
      if (skuSize != null) page.buy_again_component.skuSize = skuSize;
    }
  } else if (buyAgainAgg && !buyAgainAgg.success) {
    Logger.warn(
      `Warning for Web Home Page API method: mergeWebHomePageResponsesV3 CCP buy again response failed.`,
      buyAgainAgg.error ?? 'Unknown error',
    );
  }

  /**
   * 3) Inject pending dispatch quantity
   */
  if (pendingDispatchResponse?.success) {
    page.pendingDispatchQuantity = pendingDispatchResponse.data;
  } else if (pendingDispatchResponse && !pendingDispatchResponse.success) {
    Logger.warn(
      `Warning for Web Home Page API method: mergeWebHomePageResponsesV3 pending-dispatch-quantity response failed.`,
      pendingDispatchResponse.error ?? 'Unknown error',
    );
  }
  /**
   * 4) Convert product_category_component[].product_categories -> app_product_categories
   */
  if (Array.isArray(page.product_category_component)) {
    for (const comp of page.product_category_component) {
      if (comp?.product_categories && !comp.app_product_categories) {
        comp.app_product_categories = comp.product_categories;
        delete comp.product_categories;
      }
    }
  }
  if (Array.isArray(page.industry_specific_components)) {
    for (const comp of page.industry_specific_components) {
      if (comp?.product_categories && !comp.app_product_categories) {
        comp.app_product_categories = comp.product_categories;
        delete comp.product_categories;
      }
    }
  }

  /**
   * 5) Inject productsList into product_category_component app_product_categories
   */
  if (webProductsResponse?.success) {
    const productsData = webProductsResponse.data?.data ?? webProductsResponse.data?.data ?? {};

    const productCategoryBlocks = Array.isArray(page.product_category_component)
      ? page.product_category_component
      : [];

    const IndustrySpecificBlock = Array.isArray(page.industry_specific_components)
      ? page.industry_specific_components
      : [];

    for (const block of productCategoryBlocks) {
      block?.app_product_categories
        ?.filter((c: any) => c.webCategoryId && c.itemsToShow)
        ?.forEach((c: any) => {
          c.productsList = productsData[c.webCategoryId];
        });

      // Inject centralCategoryIdData for product listing
      if (
        productsListingResponse?.success &&
        Array.isArray(productsListingResponse.data?.data?.products)
      ) {
        const productsArray = productsListingResponse.data.data.products;

        const filteredCategories = block?.app_product_categories?.filter(
          (c: any) => c.webCategoryId && c.itemsToShow,
        );

        if (filteredCategories && filteredCategories.length > 0) {
          filteredCategories[0].centralCategoryIdData = [{ products: productsArray }];
        }
      }
    }
    for (const block of IndustrySpecificBlock) {
      block?.app_product_categories
        ?.filter((c: any) => c.webCategoryId && c.itemsToShow)
        ?.forEach((c: any) => {
          c.productsList = productsData[c.webCategoryId];
        });

      // Inject centralCategoryIdData for product listing
      if (
        industryProductsListingResponse?.success &&
        Array.isArray(industryProductsListingResponse.data?.data?.products)
      ) {
        const productsArray = industryProductsListingResponse.data.data.products;

        const filteredCategories = block?.app_product_categories?.filter(
          (c: any) => c.webCategoryId && c.itemsToShow,
        );

        if (filteredCategories && filteredCategories.length > 0) {
          filteredCategories[0].centralCategoryIdData = [{ products: productsArray }];
        }
      }
    }
  }

  /**
   * 6) Inject central catalogue nav into category_component.centralCategoryIdData
   */
  if (
    webCentralCatalogueResponse?.success &&
    Array.isArray(webCentralCatalogueResponse.data?.data?.navigation) &&
    page.category_component &&
    Array.isArray(page.category_component.web_central_catalogue_categories)
  ) {
    const navigation = webCentralCatalogueResponse.data.data.navigation;
    const blockCategoryIds = page.category_component.web_central_catalogue_categories
      .map((c: any) => c.categoryId)
      .filter(Boolean);

    page.category_component.centralCategoryIdData = navigation
      .map((nav: any) => ({
        ...nav,
        subMenu: nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)),
      }))
      .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);
  }

  /**
   * 7) Inject top brand nav into top_brand_component.centralCategoryIdData
   * CMS has top_brand_component with web_central_
   * catalogue_categories
   */
  if (
    webTopBrandCategoriesResponse?.success &&
    Array.isArray(webTopBrandCategoriesResponse.data?.data?.navigation) &&
    page.top_brand_component &&
    Array.isArray(page.top_brand_component.web_central_catalogue_categories)
  ) {
    const topBrandNavigation = webTopBrandCategoriesResponse.data.data.navigation;
    const blockCategoryIds = page.top_brand_component.web_central_catalogue_categories
      .map((c: any) => c.categoryId)
      .filter(Boolean);

    page.top_brand_component.centralCategoryIdData = topBrandNavigation
      .map((nav: any) => ({
        ...nav,
        subMenu: nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)),
      }))
      .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);
  }

  return mergedWrapper;
}
