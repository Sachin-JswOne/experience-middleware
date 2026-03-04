import { Logger } from '@nestjs/common';
import { BaseRequest } from '../models/base-request.model';
import { AggregatedResponse } from '../models/aggregated-response.model';

export function extractProductListingSlugSegment(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {
  if (!prevResponses || prevResponses.length === 0) {
    Logger.warn(`[extractProductListingSlugSegment] No previous responses available`);
    return { ...request, body: undefined };
  }

  const cmsResponse =
    prevResponses.find((r) => r.target === 'layout-mweb-segment-pages') ??
    prevResponses.find((r) => r.target === 'layout-mweb-homepages');

  if (!cmsResponse || !cmsResponse.success) {
    Logger.warn(
      `[extractProductListingSlugSegment] CMS response not found or failed. Available targets: ${prevResponses
        .map((r) => r.target)
        .join(', ')}`,
    );
    return { ...request, body: undefined };
  }

  const cmsData = cmsResponse.data?.data;
  const firstPage = Array.isArray(cmsData) ? cmsData[0] : null;

  let slug: string | undefined;

  const productCategoryComponents = firstPage?.industry_specific_components;

  if (Array.isArray(productCategoryComponents)) {
    for (const comp of productCategoryComponents) {
      const categories = Array.isArray(comp?.app_product_categories)
        ? comp.app_product_categories
        : [];
      for (const cat of categories) {
        const firstCentral =
          Array.isArray(cat?.web_central_catalogue_categories) &&
          cat.web_central_catalogue_categories.length > 0
            ? cat.web_central_catalogue_categories[0]
            : null;

        const candidate = firstCentral?.categorySlug;
        if (typeof candidate === 'string' && candidate.trim()) {
          slug = candidate.trim();
          break;
        }
      }
      if (slug) break;
    }
  }

  if (!slug) {
    Logger.warn(
      `[extractProductListingSlugSegment] No categorySlug found in segment CMS response. Returning request without body to avoid bad POST payload.`,
    );
    return { ...request, body: undefined };
  }

  const requestBody = {
    offSet: 0,
    limit: 21,
    slug,
    storefront: 'msme',
  };

  Logger.log(`[extractProductListingSlugSegment] Using slug="${slug}"`);

  return {
    ...request,
    body: requestBody,
    headers: { ...request.headers },
  };
}
