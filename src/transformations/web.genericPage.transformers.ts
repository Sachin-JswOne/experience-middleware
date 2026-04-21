import { Logger } from '@nestjs/common';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
export { extractProductListingSlugv3 } from 'src/utils/central-category.util';
export function mergeWebGenericPageResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const cmsResponse = responses['layout-landing-pages'];
  const webCentralCatalogueResponse = responses['web-categories'];
  const webProductsResponse = responses['web-products'];
  const productsListingResponse = responses['products-listing'];
  const blogsResponse = responses['app-blogs'];

  if (
    !cmsResponse ||
    !cmsResponse.success ||
    typeof cmsResponse.data !== 'object' ||
    cmsResponse.data === null ||
    !Array.isArray(cmsResponse.data?.data)
  ) {
    Logger.error(`CMS response invalid`);
    return { data: {}, meta: {} };
  }

  // ALWAYS take first page (since filtered by title)
  const page = cmsResponse.data.data[0];

  /**
   * normalize onehelix → blocks
   */
  const blocks: any[] = Array.isArray(page?.genericPage) ? [...page.genericPage] : [];

  /**
   * CATEGORY INJECTION (same as homepage)
   */
  if (
    webCentralCatalogueResponse?.success &&
    Array.isArray(webCentralCatalogueResponse.data?.data?.navigation)
  ) {
    const navigation = webCentralCatalogueResponse.data.data.navigation;

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
  if (webProductsResponse?.success) {
    const productsData = webProductsResponse.data?.data ?? {};

    for (const block of blocks) {
      //  handle app-product-category
      if (block.__component === 'app-components.app-product-category') {
        block?.app_product_categories
          ?.filter((c: any) => c.webCategoryId && c.itemsToShow)
          ?.forEach((c: any) => {
            c.productsList = productsData[c.webCategoryId];
          });

        // listing API injection (same as homepage)
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
    }
  }
  // Inject blogs
  const blogs = blogsResponse?.data?.data || [];
  const blogsBlock = blocks.find(
    (block: any) => block.__component === 'app-components.app-blog-list-component',
  );
  if (blogsBlock) {
    blogsBlock.blogs = blogs;
  }

  const mergedData = {
    ...page,
    blocks: blocks,
  };

  //  remove original dynamic field
  delete mergedData.genericPage;

  return {
    data: mergedData,
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };
}