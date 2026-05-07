import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';
import { BaseRequest } from 'src/models/base-request.model';
import {
  extractMMIDs,
  normalizeRecentlyViewedProducts,
  RecentlyViewedProduct,
} from './web.transformers';
import { inspect } from 'util';

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
  const topItemsResponse = responses['app-search-top-items'];
  safeDebug(
    Logger,
    () =>
      `Strapi Home Page Api response from method: mergeAppHomePageResponses : ${inspect(
        strapiResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Buy Again Api response from method: mergeAppHomePageResponses : ${inspect(
        buyAgainResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Categories Api response from method: mergeAppHomePageResponses : ${inspect(
        categoriesResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () => `Blog Api response from method: mergeAppHomePageResponses : ${inspect(blogResponse)}`,
  );
  safeDebug(
    Logger,
    () =>
      `In Transit Api response from method: mergeAppHomePageResponses : ${inspect(
        inTransitResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Top Items Api response from method: mergeAppHomePageResponses : ${inspect(
        topItemsResponse,
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

  if (topItemsResponse?.success && Array.isArray(topItemsResponse.data?.data?.products)) {
    const topItems = topItemsResponse?.success
      ? (topItemsResponse?.data?.data?.products ?? topItemsResponse.data?.products ?? [])
      : null;

    if (!Array.isArray(topItems) || topItems.length === 0) {
      safeDebug(
        Logger,
        () => `Top Items from Central Catalogue: empty/fail; keeping CMS top items as-is.`,
      );
    } else {
      const topItemBlock = blocks.filter(
        (b: any) =>
          b.__component === 'app-components.app-search-top-items' &&
          Array.isArray(b.app_search_top_items),
      );

      for (const block of topItemBlock) {
        const cmsItems = block.app_search_top_items;

        const productMap = new Map(
          topItems
            .filter((p) => typeof p?.product_mmid === 'string' && p.product_mmid.length > 0)
            .map((p) => [p.product_mmid, p]),
        );

        block.centralCatalogueTopItemList = cmsItems
          .map((cmsItem) => {
            const product = productMap.get(cmsItem.MMID);

            if (!product) return null;

            return {
              title: product?.attributes?.product_title,
              webUrl: product?.attributes?.slug,
              MMID: product?.product_mmid,
              brand: product?.attributes?.brand,
              image: product?.meta_data?.product_media?.[0]?.public_url,
              categoryName: product?.associated_categories?.find((cat) =>
                cat?.path?.toLowerCase().includes('all products'),
              )?.attributes?.category_title,
            };
          })
          .filter(Boolean);
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

// This transformer is used to extract MMIDs from request
export function transformTopItemsRequest(
  request: BaseRequest,
  aggregatedResponses: AggregatedResponse[],
) {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
  const aggregateResponse = responses['app-home-page'].data.data;

  const topItemsResponse = aggregateResponse.blocks.find(
    (block) => block.__component === 'app-components.app-search-top-items',
  ).app_search_top_items;
  const mmids = extractMMIDs(topItemsResponse);
  return {
    ...request,
    body: mmids,
  };
}

export function mergeAppHomePageResponseV4(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const cmsResponse = responses['layout-mweb-homepages'] ?? responses['app-home-page']; // fallback (optional)
  const blogsResponse = responses['app-blogs']; //done
  const buyAgainResponse = responses['app-buy-again'];
  const webProductsResponse = responses['web-homepage-products']; //done
  const catalogueResponse = responses['app-categories']; //done
  const topBrandCategoriesResponse = responses['app-top-brands']; //done
  const productsListingResponse = responses['products-listing']; //done
  const industryProductsListingResponse = responses['industry-products-listing']; //done
  const featureFlags = responses['cmsFeatureFlag']?.data?.data ?? [];
  const topItemsResponse = responses['app-search-top-items']; //done
  const inTransitResponse = responses['app-in-transit']; //done
  const isCentralCatalogueEnabled =
    Array.isArray(featureFlags) &&
    featureFlags.some((f: any) => f?.name === 'central_catalogue_global' && f?.isActive === true);

  safeDebug(Logger, () => `isCentralCatalogueEnabled → ${String(isCentralCatalogueEnabled)}`);
  safeDebug(
    Logger,
    () =>
      `CMS Home Page API response from method: mergeAppHomePageResponseV4 : ${inspect(
        cmsResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () => `Blogs API response from method: mergeAppHomePageResponseV4 : ${inspect(blogsResponse)}`,
  );
  safeDebug(
    Logger,
    () =>
      `Buy Again with prices API response from method: mergeAppHomePageResponseV4 : ${inspect(
        buyAgainResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Pending Dispatch Quantity API response from method: mergeAppHomePageResponseV4 : ${inspect(
        inTransitResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Web Homepage Products API response from method: mergeAppHomePageResponseV4 : ${inspect(
        webProductsResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Web Central Catalogue Categories API response from method: mergeAppHomePageResponseV4 : ${inspect(
        catalogueResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Web Central Top Brand Categories API response from method: mergeAppHomePageResponseV4 : ${inspect(
        topBrandCategoriesResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Products Listing API response from method: mergeAppHomePageResponseV4 : ${inspect(
        productsListingResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Industry Products Listing API response from method: mergeAppHomePageResponseV4 : ${inspect(
        industryProductsListingResponse,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Feature Flags API response from method: mergeAppHomePageResponseV4 : ${inspect(
        featureFlags,
      )}`,
  );
  safeDebug(
    Logger,
    () =>
      `Top Items CCP API response from method: mergeAppHomePageResponseV4 : ${inspect(
        topItemsResponse,
      )}`,
  );

  if (
    !cmsResponse ||
    !cmsResponse.success ||
    typeof cmsResponse.data !== 'object' ||
    cmsResponse.data === null ||
    !Array.isArray((cmsResponse.data as any)?.data)
  ) {
    Logger.error(
      `Error for Home Page API method: mergeAppHomePageResponseV4 CMS response is missing or invalid`,
    );
    return { data: {}, meta: {} };
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
  //Adding blogs data in blog_list_component_material_matter
  const blogs = blogsResponse?.data?.data || [];
  if (page.blog_list_component_material_matter) {
    page.blog_list_component_material_matter.blogs = blogs;
  }

  //Add buy again response in buy_again_component
  if (buyAgainResponse?.success) {
    const rawData = buyAgainResponse.data?.data ?? buyAgainResponse.data ?? {};
    const { listOfBuyAgainProducts, variantList, skuSize } = rawData;
    const products =
      listOfBuyAgainProducts ?? variantList ?? (Array.isArray(rawData) ? rawData : []);

    if (page.buy_again_component && Array.isArray(products) && products.length > 0) {
      page.buy_again_component.listOfBuyAgainProducts = products;
      if (variantList) page.buy_again_component.variantList = variantList;
      if (skuSize != null) page.buy_again_component.skuSize = skuSize;
    }
  } else if (buyAgainResponse && !buyAgainResponse.success) {
    Logger.warn(
      `Warning for Web Home Page API method: mergeWebHomePageResponsesV3 CCP buy again response failed.`,
      buyAgainResponse.error ?? 'Unknown error',
    );
  }

  //top items integrated with Central catalogue
  const buyAgainList = page?.buy_again_component?.listOfBuyAgainProducts;
  const hasBuyAgainData = Array.isArray(buyAgainList) && buyAgainList.length > 0;

  if (hasBuyAgainData) {
    page.mweb_top_item.isTopItem = false;
    if ('top_items_product_details' in page.mweb_top_item) {
      delete page.mweb_top_item.top_items_product_details;
    }
  } else if (isCentralCatalogueEnabled) {
    page.mweb_top_item.isTopItem = true;

    if (topItemsResponse?.success && Array.isArray(topItemsResponse.data?.data?.products)) {
      const ccpProducts = topItemsResponse?.success
        ? (topItemsResponse.data?.data?.products ?? topItemsResponse.data?.products ?? [])
        : null;

      if (!Array.isArray(ccpProducts) || ccpProducts.length === 0) {
        safeDebug(Logger, () => `Top Items: CCP empty/fail; keeping CMS top items as-is.`);
      } else {
        // Map CCP products by MMID
        const productMap = new Map<string, any>(
          ccpProducts
            .filter((p: any) => typeof p?.product_mmid === 'string' && p.product_mmid.length > 0)
            .map((p: any) => [p.product_mmid, p]),
        );
        const cmsItems = page.mweb_top_item.app_search_top_items;
        page.mweb_top_item.app_search_top_items = cmsItems.map((cmsItem: any) => {
          const mmid = cmsItem?.MMID;
          if (typeof mmid !== 'string' || !mmid) return cmsItem;
          const product = productMap.get(mmid);
          if (!product) {
            safeDebug(Logger, () => `Top Items: MMID not found in CCP → ${inspect(mmid)}`);
            return cmsItem; // keep CMS item if CCP doesn't have it
          }
          page.mweb_top_item.app_search_top_items = {
            brand: product?.attributes?.brand,
            categoryName: product?.associated_categories?.find((cat) =>
              cat?.path?.toLowerCase().includes('all products'),
            )?.attributes?.category_title,
            title: product.attributes?.product_title,
            webUrl: product.attributes?.slug,
            MMID: product.product_mmid,
            image: product.meta_data?.product_media?.[0]?.public_url,
          };
          return page.mweb_top_item.app_search_top_items;
        });
      }
    }
  } else {
    page.mweb_top_item.isTopItem = true;
    safeDebug(
      Logger,
      () => 'Central Catalogue Global flag is disabled. Returning CMS top items as-is.',
    );
  }

  //top brands integrated with central catalogue
  if (
    topBrandCategoriesResponse?.success &&
    Array.isArray(topBrandCategoriesResponse.data?.data?.navigation)
  ) {
    const topBrandNavigation = topBrandCategoriesResponse.data.data.navigation;
    const blockCategoryIds = page.top_brand_component.web_central_catalogue_categories
      .map((c: any) => c.categoryId)
      .filter(Boolean);

    const centralCategoryBrandData = topBrandNavigation
      .map((nav: any) => ({
        ...nav,
        subMenu: nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)),
      }))
      .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);

    if (centralCategoryBrandData.length > 0) {
      page.top_brand_component.centralCatalogueBrandsList = centralCategoryBrandData[0].subMenu.map(
        (brand) => ({
          name: brand.name || '',
          slug: brand.slug || '',
          image: brand.metaImage.url || '',
        }),
      );
    } else {
      page.top_brand_component.centralCatalogueBrandsList = [];
    }
  }

  //categories component integrated with central catalogue categories
  if (catalogueResponse?.success && Array.isArray(catalogueResponse.data?.data?.navigation)) {
    const navigation = catalogueResponse.data.data.navigation;

    const blockCategoryIds = page.category_component.web_central_catalogue_categories
      .map((c: any) => c.categoryId)
      .filter(Boolean);

    const centralCategoryCategoriesData = navigation
      .map((nav: any) => ({
        ...nav,
        subMenu: nav.subMenu?.filter((sub: any) => blockCategoryIds.includes(sub.id)),
      }))
      .filter((nav: any) => nav.subMenu && nav.subMenu.length > 0);
    if (centralCategoryCategoriesData.length > 0) {
      page.category_component.centralCatalogueCategoriesList =
        centralCategoryCategoriesData[0].subMenu.map((category: any) => ({
          name: category.name || '',
          slug: category.slug || '',
          image: category.metaImage.url || '',
        }));
    } else {
      page.category_component.centralCatalogueCategoriesList = [];
    }
  }

  //intransit component
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
    page.link_banner_component.inTransit = inTransit;
  }

  //product listing
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

  // Recently viewed
  const recentlyViewedDetailsAgg = responses['recently-viewed-product-details'];
  const recentViewedRemoveAgg = responses['recent-viewed-remove'];

  if (page.recently_viewed_component) {
    let removedMmids: string[] = [];
    if (recentViewedRemoveAgg?.success && recentViewedRemoveAgg.data?.data?.removeProduct) {
      removedMmids = recentViewedRemoveAgg.data.data.removeProduct;
    } else if (recentViewedRemoveAgg && !recentViewedRemoveAgg.success) {
      Logger.warn(
        `Warning for Web Home Page API method: mergeWebHomePageResponsesV3 recent-viewed-remove response failed.`,
        recentViewedRemoveAgg.error ?? 'Unknown error',
      );
    }

    let recentlyViewedProducts: RecentlyViewedProduct[] = [];
    if (recentlyViewedDetailsAgg?.success) {
      recentlyViewedProducts = normalizeRecentlyViewedProducts(
        recentlyViewedDetailsAgg.data as any,
      );
    } else if (recentlyViewedDetailsAgg && !recentlyViewedDetailsAgg.success) {
      Logger.warn(
        `Warning for Web Home Page API method: mergeWebHomePageResponsesV3 recently-viewed-product-details response failed.`,
        recentlyViewedDetailsAgg.error ?? 'Unknown error',
      );
    }

    // Filter out naturally removed products and expose removedMmids for frontend
    page.recently_viewed_component.recentlyViewedProducts = recentlyViewedProducts.filter(
      (product) => !removedMmids.includes(product.mmid),
    );
    page.recently_viewed_component.removedMmids = removedMmids;
  }

  const finalSortedResponse = sortResponseByOrder(mergedWrapper.data[0]);
  mergedWrapper.data[0] = finalSortedResponse;
  return mergedWrapper;
}

function sortResponseByOrder(response: any) {
  const fixedKeys = ['id', 'documentId', 'industries'];

  const dynamicEntries = Object.entries(response)
    .filter(([key]) => !fixedKeys.includes(key))
    .sort(([, valueA], [, valueB]) => {
      const getOrder = (value: any) => {
        if (!value) return 999;

        // Array components
        if (Array.isArray(value)) {
          return Number(value?.[0]?.order || 999);
        }

        // Object components
        if (typeof value === 'object') {
          return Number(value?.order || 999);
        }

        return 999;
      };

      return getOrder(valueA) - getOrder(valueB);
    });

  // Preserve fixed keys at top
  const sortedResponse: any = {};

  fixedKeys.forEach((key) => {
    if (response[key] !== undefined) {
      sortedResponse[key] = response[key];
    }
  });

  // Add sorted components
  dynamicEntries.forEach(([key, value]) => {
    sortedResponse[key] = value;
  });

  return sortedResponse;
}
