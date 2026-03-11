import { Logger } from '@nestjs/common';
import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { CustomError } from 'src/utils/CustomError';
import { moveBodyToQueryParams } from './general.transformers';
import * as cmsTransformers from './cms.transformers';

export function selectIndustryContentTarget(req: any): string {
  const industry = String(req?.body?.industry ?? '')
    .trim()
    .toLowerCase();

  if (industry === 'all') {
    return 'blogs-only';
  }

  return 'industry-all-content';
}

export function forwardBlogsQueryBody(request: BaseRequest): BaseRequest {
  return {
    ...request,
    body: request.body?.blogsQuery ?? {},
  };
}

export function pickBlogsQuery(request: BaseRequest): BaseRequest {
  return moveBodyToQueryParams({
    ...request,
    body: request.body?.blogsQuery ?? {},
  });
}

export function pickMatrixQuery(request: BaseRequest): BaseRequest {
  return moveBodyToQueryParams({
    ...request,
    body: request.body?.matrixQuery ?? {},
  });
}

export function pickIndustryQuery(request: BaseRequest): BaseRequest {
  return moveBodyToQueryParams({
    ...request,
    body: request.body?.industryQuery ?? {},
  });
}

export function wrapBlogsOnlyResponse(response: any) {
  const transformedResponse =
    typeof cmsTransformers?.replaceUriPrefix === 'function'
      ? cmsTransformers.replaceUriPrefix(response)
      : response;

  return {
    blogs: transformedResponse,
  };
}

export function extractProductListingSlugFromIndustrySpecificResponse(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {
  if (!prevResponses || prevResponses.length === 0) {
    Logger.warn(
      `[extractProductListingSlugFromIndustrySpecificResponse] No previous responses available`,
    );
    throw new CustomError(
      '[extractProductListingSlugFromIndustrySpecificResponse] No previous responses available.',
      400,
    );
  }

  const industryResponse = prevResponses.find((r) => r.target === 'industry-specific-components');

  if (!industryResponse || !industryResponse.success) {
    Logger.warn(
      `[extractProductListingSlugFromIndustrySpecificResponse] industry-specific-components response not found or failed`,
    );
    throw new CustomError(
      '[extractProductListingSlugFromIndustrySpecificResponse] industry-specific-components response not found or failed.',
      400,
    );
  }

  const cmsData = industryResponse.data?.data;
  const firstItem = Array.isArray(cmsData) ? cmsData[0] : null;

  let slug: string | undefined;
  const categories = Array.isArray(firstItem?.app_product_categories)
    ? firstItem.app_product_categories
    : [];

  for (const category of categories) {
    const firstCentralCategory =
      Array.isArray(category?.web_central_catalogue_categories) &&
      category.web_central_catalogue_categories.length > 0
        ? category.web_central_catalogue_categories[0]
        : null;

    const candidateSlug = firstCentralCategory?.categorySlug;
    if (typeof candidateSlug === 'string' && candidateSlug.trim()) {
      slug = candidateSlug.trim();
      break;
    }
  }

  if (!slug) {
    Logger.warn(
      `[extractProductListingSlugFromIndustrySpecificResponse] No categorySlug found in industry-specific-components response`,
    );
    throw new CustomError(
      '[extractProductListingSlugFromIndustrySpecificResponse] No categorySlug found.',
      400,
    );
  }

  Logger.log(`[extractProductListingSlugFromIndustrySpecificResponse] Using slug="${slug}"`);

  return {
    ...request,
    body: {
      offSet: 0,
      limit: 21,
      slug,
    },
    headers: {
      ...request.headers,
    },
  };
}

export function mergeIndustryAllContentResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const blogsResponse = responses['blogs'];

  const metricsResponse = responses['metrics'];
  const industrySpecificResponse = responses['industry-specific-components'];
  const productListingResponse = responses['products-listing'];
  return {
    blogs: blogsResponse.data,
    metrics: metricsResponse?.success ? metricsResponse.data : null,
    industrySpecificComponents: industrySpecificResponse?.success
      ? industrySpecificResponse.data
      : null,
    productListing: productListingResponse?.success ? productListingResponse.data : null,
  };
}
