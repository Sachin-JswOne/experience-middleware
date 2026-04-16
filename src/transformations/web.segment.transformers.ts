import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug, safeToLog } from 'src/utils/common-functions.util';
import { extractProductListingSlugSegment } from 'src/utils/segment-category.util';
import { BaseRequest } from 'src/models/base-request.model';

export { extractProductListingSlugSegment };
const WEB_HOME_PAGE_V3_CMS_KEY = '__webHomePageV3CmsResponse';
export function extractProductListingSlugSegmentFromCmsBody(request: BaseRequest): BaseRequest {
  const cmsResponse = request?.body?.[WEB_HOME_PAGE_V3_CMS_KEY] ?? null;

  return extractProductListingSlugSegment(request, [
    {
      target: 'layout-mweb-homepages',
      success: true,
      data: {
        data: cmsResponse ? [cmsResponse] : [],
        meta: {},
      },
    } as AggregatedResponse,
  ]);
}

export function mergeWebSegmentPageResponsesV1(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const cmsResponse = responses['layout-mweb-segment-pages'];
  const blogsResponse = responses['app-blogs'];
  const webProductsResponse = responses['web-segment-products'];
  const productsListingResponse = responses['segment-products-listing'];

  safeDebug(
    Logger,
    () =>
      `CMS Api response from method: mergeWebSegmentPageResponsesV1 : ${safeToLog(cmsResponse)}`,
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
      `Error for Web Segment Page API method: mergeWebSegmentPageResponsesV1 CMS response is missing or invalid.`,
    );
    return { data: [], meta: {} };
  }

  const cmsPayload = cmsResponse.data as any;

  const mergedWrapper: any = {
    data: JSON.parse(JSON.stringify(cmsPayload.data ?? [])),
    meta: cmsPayload.meta ?? {},
  };

  if (!mergedWrapper.data.length) return mergedWrapper;

  const page = mergedWrapper.data[0];

  /**
   * 1) Inject Blogs into blog_list_component_material_matter.blogs
   */
  const blogs = blogsResponse?.data?.data || [];
  if (page.blog_list_component_material_matter) {
    page.blog_list_component_material_matter.blogs = blogs;
  }

  /**
   * 2) Inject productsList into:
   * - industry_specific_components[*].app_product_categories[*]
   */
  if (webProductsResponse?.success) {
    const productsData = webProductsResponse.data?.data ?? {};

    const productCategoryBlocks = Array.isArray(page.product_category_component)
      ? page.product_category_component
      : [];

    const industrySpecificBlocks = Array.isArray(page.industry_specific_components)
      ? page.industry_specific_components
      : [];

    const injectProductsList = (blocks: any[]) => {
      for (const block of blocks) {
        const cats = Array.isArray(block?.app_product_categories)
          ? block.app_product_categories
          : [];
        for (const c of cats) {
          if (c?.webCategoryId && c?.itemsToShow) {
            c.productsList = productsData[c.webCategoryId];
          }
        }
      }
    };

    injectProductsList(productCategoryBlocks);
    injectProductsList(industrySpecificBlocks);
  }

  /**
   * 3) Inject centralCategoryIdData using products-listing response
   */
  if (
    productsListingResponse?.success &&
    Array.isArray(productsListingResponse.data?.data?.products)
  ) {
    const productsArray = productsListingResponse.data.data.products;

    const injectListing = (blocks: any[]) => {
      for (const block of blocks) {
        const cats = Array.isArray(block?.app_product_categories)
          ? block.app_product_categories
          : [];
        const eligible = cats.filter((c: any) => c?.webCategoryId && c?.itemsToShow);
        if (eligible.length > 0) {
          eligible[0].centralCategoryIdData = [{ products: productsArray }];
        }
      }
    };

    const productCategoryBlocks = Array.isArray(page.product_category_component)
      ? page.product_category_component
      : [];

    const industrySpecificBlocks = Array.isArray(page.industry_specific_components)
      ? page.industry_specific_components
      : [];

    injectListing(productCategoryBlocks);
    injectListing(industrySpecificBlocks);
  }

  return mergedWrapper;
}
