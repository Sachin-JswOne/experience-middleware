import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { BaseRequest } from 'src/models/base-request.model';
import { safeDebug, safeToLog } from 'src/utils/common-functions.util';

export function mergeHomePageResponses(aggregatedResponses: AggregatedResponse[]): any {
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
  const blogResponse = responses['app-blogs'];
  const inTransitResponse = responses['app-in-transit'];

  safeDebug(
    Logger,
    () =>
      `Strapi Home Page Api response from method: mergeHomePageResponses : ${JSON.stringify(
        strapiResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Top Items Api response from method: mergeHomePageResponses : ${JSON.stringify(
        topItemsResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Buy Again Api response from method: mergeHomePageResponses : ${JSON.stringify(
        buyAgainResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Categories Api response from method: mergeHomePageResponses : ${JSON.stringify(
        categoriesResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () => `Blog Api response from method: mergeHomePageResponses : ${JSON.stringify(blogResponse)}`,
  );
  safeDebug(
    Logger,
    () =>
      `In Transit Api response from method: mergeHomePageResponses : ${JSON.stringify(
        inTransitResponse,
      )}`,
  );
  if (!strapiResponse || typeof strapiResponse.data !== 'object' || strapiResponse.data === null) {
    Logger.error(
      `Error for Home Page API method: mergeHomePageResponses Strapi response is missing or invalid`,
    );
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
      ...((strapiResponse.data.data as { blocks?: unknown[] }).blocks as unknown[]),
    ];
  }
  const blocks: any[] = originalBlocks;

  const buyAgainProducts = (buyAgainResponse?.data as { listOfBuyAgainProducts?: unknown })
    ?.listOfBuyAgainProducts;
  if (Array.isArray(buyAgainProducts)) {
    const buyAgainBlock = blocks.find(
      (block) => block.__component === 'app-components.app-buy-again',
    );
    if (buyAgainBlock) {
      buyAgainBlock.listOfBuyAgainProducts = buyAgainProducts;
    }
  }

  // Prepare top items block if available
  const topProducts = (topItemsResponse?.data as { topProducts?: unknown })?.topProducts;
  if (Array.isArray(topProducts)) {
    const topItemsBlock = blocks.find(
      (block) => block.__component === 'app-components.app-top-items',
    );
    if (topItemsBlock) {
      topItemsBlock.topProducts = topProducts;
    }
  }

  const categories: any[] | undefined = (categoriesResponse?.data as { categories?: any[] })
    ?.categories;
  const categoriesBlock = blocks.find(
    (block) => block.__component === 'app-components.app-category-component',
  );
  if (categoriesBlock && categoriesBlock.product_categories) {
    let filteredCategories: any[] = [];
    if (categories) {
      filteredCategories = categoriesBlock.product_categories.filter((category) =>
        categories.some((c: any) => c.categoryId === category.categoryId),
      );
    }
    categoriesBlock.product_categories = filteredCategories;
  }

  const topBrands: any[] | undefined = (categoriesResponse?.data as { brands?: any[] })?.brands;

  if (Array.isArray(topBrands)) {
    const topBrandsBlockIndex = blocks.findIndex(
      (block) => block.__component === 'app-components.app-top-brands',
    );

    if (topBrandsBlockIndex !== -1) {
      const topBrandsBlock = blocks[topBrandsBlockIndex];

      const brands: any[] = [];
      if (topBrandsBlock.product_brands) {
        topBrandsBlock.product_brands.forEach((brand: any) => {
          const brandData = {
            image: brand.image?.url || '',
            name: brand.name || '',
          };
          brands.push(brandData);
        });
      }

      const productBrands = brands.filter((brand) => topBrands.includes(brand.name));

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { product_brands, ...restOfBlock } = topBrandsBlock;

      blocks[topBrandsBlockIndex] = {
        ...restOfBlock,
        productBrands,
      };
    }
  }

  const blogs = (blogResponse?.data as { data?: unknown })?.data;
  if (Array.isArray(blogs)) {
    const blogBlock = blocks.find(
      (block) => block.__component === 'app-components.app-blog-list-component',
    );
    if (blogBlock) {
      blogBlock.blogs = blogs;
    }
  }

  const inTransitApiResponse = inTransitResponse;
  let inTransit = false;
  if (
    inTransitApiResponse.success &&
    inTransitApiResponse.data.success &&
    inTransitApiResponse.data.data.success
  ) {
    const inTransitData = inTransitApiResponse.data.data.response.data;
    if (inTransitData && inTransitData.length > 0) {
      inTransit = true;
    }
  }

  const inTransitBlock = blocks.find(
    (block) => block.__component === 'app-components.app-link-banner',
  );
  if (inTransitBlock) {
    inTransitBlock.inTransit = inTransit;
  }

  mergedData.blocks = blocks;

  return {
    data: mergedData,
  };
}

export function mergeBuyAgainResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const buyAgainPriceApiResponse = responses['ccp-buy-again-with-prices'];
  const buyAgainRetailApiResponse = responses['app-buy-again'];

  safeDebug(
    Logger,
    () =>
      ` Buy Again Price Api response from method: mergeBuyAgainResponses : ${JSON.stringify(
        buyAgainPriceApiResponse,
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      `Buy Again Retail Api response from method: mergeBuyAgainResponses : ${JSON.stringify(
        buyAgainRetailApiResponse,
      )}`,
  );
  if (buyAgainRetailApiResponse.success) {
    if (buyAgainPriceApiResponse.data && buyAgainRetailApiResponse.data) {
      if (buyAgainPriceApiResponse.data.length === 0) {
        if (buyAgainRetailApiResponse.data.listOfBuyAgainProducts) {
          buyAgainRetailApiResponse.data.listOfBuyAgainProducts.forEach((product: any) => {
            product.price = '';
          });
        }
        return buyAgainRetailApiResponse.data;
      }
      if (
        Array.isArray(buyAgainPriceApiResponse.data) &&
        Array.isArray(buyAgainRetailApiResponse.data.listOfBuyAgainProducts)
      ) {
        buyAgainRetailApiResponse.data.listOfBuyAgainProducts.forEach((product: any) => {
          const priceProduct = buyAgainPriceApiResponse.data.find(
            (p: any) => p.variantKey === product.variantKey,
          );
          if (priceProduct) {
            product.price = priceProduct.displayVariantLineItemPrice || '';
          } else {
            product.price = '';
          }
        });
      }
      return buyAgainRetailApiResponse.data;
    }
  } else {
    Logger.error(
      `Error for Buy Again API method: mergeBuyAgainResponses Buy again retail API response failed`,
    );
    return {
      listOfBuyAgainProducts: [],
    };
  }
}

export function mergeTopBrandsResponses(aggregatedResponses) {
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
      ` Strapi Top Brands Api response from method: mergeTopBrandsResponses : ${JSON.stringify(
        strapiTopBrandsData,
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      ` Top Brands Api response from method: mergeTopBrandsResponses : ${JSON.stringify(
        topBrandsApiData,
      )}`,
  );

  const defaultResponse = {
    productBrands: [],
  };

  if (strapiTopBrandsData.success && topBrandsApiData.success) {
    const strapiBrandsResponse = strapiTopBrandsData.data.data;

    if (
      strapiBrandsResponse.branding_sections &&
      Array.isArray(strapiBrandsResponse.branding_sections) &&
      strapiBrandsResponse.branding_sections.length > 0
    ) {
      const topBrandsStrapiResponse = strapiBrandsResponse.branding_sections[0];

      if (!topBrandsStrapiResponse) {
        Logger.error(
          `Error for Top Brands API method: mergeTopBrandsResponses Top brands Strapi response is missing`,
        );
        return defaultResponse;
      }
      const brands: any[] = [];
      if (topBrandsStrapiResponse.product_brands) {
        topBrandsStrapiResponse.product_brands.forEach((brand: any) => {
          const brandData = {
            image: brand.image?.url || '',
            name: brand.name || '',
          };
          brands.push(brandData);
        });
      }

      const topBrandsApiResponse = topBrandsApiData.data?.brands;

      if (topBrandsApiResponse && topBrandsApiResponse.length > 0) {
        const topBrands: string[] = topBrandsApiResponse;

        const productBrands = brands.filter((brand) => topBrands.includes(brand.name));
        const response = {
          __component: topBrandsStrapiResponse.__component,
          id: topBrandsStrapiResponse.id,
          title: topBrandsStrapiResponse.title,
          productBrands: productBrands,
        };
        return response;
      } else {
        return {
          __component: topBrandsStrapiResponse.__component,
          id: topBrandsStrapiResponse.id,
          title: topBrandsStrapiResponse.title,
          productBrands: [],
        };
      }
    }
    Logger.error(
      `Error for Top Brands API method: mergeTopBrandsResponses Strapi branding sections not found or invalid`,
    );
    return defaultResponse;
  } else {
    Logger.error(
      `Error for Top Brands API method: mergeTopBrandsResponses Strapi or API data response failed`,
    );
    return defaultResponse;
  }
}

export function transformInTransitRequest(request) {
  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: null,
  };
  finalTransformedRequest.url.search = `?page=1&size=10&cursorTimestamp=0`;
  return finalTransformedRequest;
}

export function mergeCustomerProfileWithMouEligibility(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const profileResp = responses['customer-profile'];
  const mouResp = responses['mou-eligibility'];

  safeDebug(
    Logger,
    () =>
      `Customer profile response from mergeCustomerProfileWithMouEligibility: ${safeToLog(
        profileResp,
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      `MOU eligibility response from mergeCustomerProfileWithMouEligibility: ${safeToLog(mouResp)}`,
  );

  const profile =
    profileResp && profileResp.data && typeof profileResp.data === 'object' ? profileResp.data : {};

  const mouEligibilityPayload =
    mouResp && mouResp.data && typeof mouResp.data === 'object' ? (mouResp.data as any) : {};

  const mouEligibility = {
    data: mouEligibilityPayload?.data ?? {},
    error: mouEligibilityPayload?.error ?? null,
  };

  return {
    ...(profile as Record<string, unknown>),
    mouEligibility,
  };
}
