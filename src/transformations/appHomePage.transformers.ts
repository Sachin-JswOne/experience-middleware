import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';

export function mergeAppHomePageResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
  const strapiResponse = responses['app-home-page'];
  const buyAgainResponse = responses['app-buy-again'];
  const topBrandsResponse = responses['app-top-brands'];
  const categoriesResponse = responses['app-categories'];
  const blogResponse = responses['app-blogs'];
  const inTransitResponse = responses['app-in-transit'];

  safeDebug(
    Logger,
    () =>
      `Strapi Home Page Api response from method: mergeAppHomePageResponses : ${JSON.stringify(
        strapiResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Buy Again Api response from method: mergeAppHomePageResponses : ${JSON.stringify(
        buyAgainResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Categories Api response from method: mergeAppHomePageResponses : ${JSON.stringify(
        categoriesResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Blog Api response from method: mergeAppHomePageResponses : ${JSON.stringify(blogResponse)}`,
  );
  safeDebug(
    Logger,
    () =>
      `In Transit Api response from method: mergeAppHomePageResponses : ${JSON.stringify(
        inTransitResponse,
      )}`,
  );
  if (!strapiResponse || typeof strapiResponse.data !== 'object' || strapiResponse.data === null) {
    Logger.error(
      `Error for Home Page API method: mergeAppHomePageResponses Strapi response is missing or invalid`,
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

  // inject top brand categories data into app-top-brands blocks
  if (topBrandsResponse?.success && Array.isArray(topBrandsResponse.data?.data?.navigation)) {
    const topBrandNavigation = topBrandsResponse.data.data.navigation;

    const topBrandsBlocks = blocks.filter(
      (b: any) =>
        b.__component === 'app-components.app-top-brands' &&
        Array.isArray(b.web_central_catalogue_categories),
    );

    for (const block of topBrandsBlocks) {
      const blockCategoryIds = block.web_central_catalogue_categories
        .map((c: any) => c.categoryId)
        .filter(Boolean);

      const centralCategoryBrandData = topBrandNavigation
        .map((nav: any) => ({
          ...nav,
          subMenu: nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)),
        }))
        .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);

      if (centralCategoryBrandData.length > 0) {
        block.centralCatalogueBrandsList = centralCategoryBrandData[0].subMenu.map((brand) => ({
          name: brand.name || '',
          slug: brand.slug || '',
          image: brand.metaImage.url || '',
        }));
      } else {
        block.centralCatalogueBrandsList = [];
      }
    }
  }

  // // inject central catalogue categories
  if (categoriesResponse?.success && Array.isArray(categoriesResponse.data?.data?.navigation)) {
    const navigation = categoriesResponse.data.data.navigation;

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

      const centralCategoryCategoriesData = navigation
        .map((nav: any) => ({
          ...nav,
          subMenu: nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)),
        }))
        .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);
      if (centralCategoryCategoriesData.length > 0) {
        block.centralCatalogueCategoriesList = centralCategoryCategoriesData[0].subMenu.map(
          (category: any) => ({
            name: category.name || '',
            slug: category.slug || '',
            image: category.metaImage.url || '',
          }),
        );
      } else {
        block.centralCatalogueCategoriesList = [];
      }
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
