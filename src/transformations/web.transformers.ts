/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { getFormattedTracingContext } from 'src/utils/tracing.util';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';

export function mergeWebHomePageResponses(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const cmsResponse = responses['app-home-page'];
  const blogsResponse = responses['app-blogs'];
  const buyAgainResponse = responses['ccp-buy-again-with-prices'];
  const pendingDispatchResponse = responses['pending-dispatch-quantity'];
  const webProductsResponse = responses['web-homepage-products'];

  Logger.debug(
    ` CMS Home Page Api response from method: mergeWebHomePageResponses : ${JSON.stringify(
      cmsResponse,
    )}`,
  );
  Logger.debug(
    ` Blogs Api response from method: mergeWebHomePageResponses : ${JSON.stringify(
      blogsResponse,
    )}`,
  );
  Logger.debug(
    ` CCP Buy Again With Price Api response from method: mergeWebHomePageResponses : ${JSON.stringify(
      buyAgainResponse,
    )}`,
  );
  Logger.debug(
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

  const blocks: any[] = Array.isArray(cmsData?.blocks)
    ? [...cmsData.blocks]
    : [];

  // Inject buy again data
  if (buyAgainResponse?.success) {
    const rawData = buyAgainResponse.data ?? {};
    const { listOfBuyAgainProducts, variantList, skuSize } = rawData as any;

    const products =
      listOfBuyAgainProducts ??
      variantList ??
      (Array.isArray(rawData) ? rawData : []);

    if (products.length > 0) {
      const block = blocks.find(
        (b: any) =>
          b.type === 'buy-again' ||
          b.__component === 'app-components.app-buy-again',
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
      block.type === 'blogs' ||
      block.__component === 'app-components.app-blog-list-component',
  );
  if (blogsBlock) {
    blogsBlock.blogs = blogs;
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
    const block = blocks.find(
      (b: any) =>
        b.__component === 'app-components.app-product-category',
    );
    block?.app_product_categories?.filter(categoryProducts => categoryProducts.webCategoryId && categoryProducts.itemsToShow)
      .map(categoryProducts => categoryProducts.productsList = productsData[categoryProducts.webCategoryId]);
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

export function catlougeByCategories(request: BaseRequest, aggregatedResponses: AggregatedResponse[]): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request
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
    throw new CustomError(categoriesResponse.downstreamResponse, categoriesResponse.httpStatus ?? 500);
  }

  const categories = categoriesResponse.data.data;

  // Remove duplicates based on webCategoryId
  const uniqueCategories = Array.from(
    new Map(
      categories
        .filter((category: any) => category.webCategoryId && category.itemsToShow > 0)
        .map((category: any) => [category.webCategoryId, category])
    ).values()
  );

  const filterRequests = uniqueCategories.map((category: any) => {
    return transformCategoryToFilterRequest(category);
  });

  transformedRequest.body = filterRequests;

  return transformedRequest;
}

export function handleProductResponse(
  aggregatedResponses: AggregatedResponse[],
): any {
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

  Object.values(productsResponse.data)
    .forEach((catProductData: any) => delete catProductData.filterConditions);

  return productsResponse;

}
