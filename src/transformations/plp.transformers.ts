import { Logger } from '@nestjs/common';
import * as qs from 'qs';
import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { CustomError } from 'src/utils/CustomError';

function getRequiredSlug(body: any): string {
  const slug = String(body?.slug ?? '').trim();

  if (!slug) {
    throw new CustomError('Bad Request: slug is required', 400);
  }

  return slug;
}

function getNormalizedPagination(body: any) {
  const offsetRaw = body?.offset ?? body?.offSet ?? 0;
  const limitRaw = body?.limit ?? 20;

  const offset = Number(offsetRaw);
  const limit = Number(limitRaw);

  return {
    offset: Number.isFinite(offset) ? offset : 0,
    limit: Number.isFinite(limit) ? limit : 20,
  };
}

// Selects the plain vs. programmatic-SEO aggregate for /central_commerce/products/listing
// based on the `isSeo` flag in the request body. Defaults to the plain target when absent,
// so the endpoint's existing behavior is unchanged unless the caller opts in.
export function selectProductsListingTarget(req: any): string {
  const isSeo = req?.body?.isSeo === true;
  return isSeo ? 'products-listing-seo' : 'products-listing-plain';
}

// Rewrites the configured placeholder URL's last path segment with the real slug from the
// request body, so we don't need to know MSME_BASE_URL inside transformer code.
export function buildProgrammaticSeoPageRequest(request: BaseRequest): BaseRequest {
  const slug = getRequiredSlug(request.body ?? {});

  const newUrl = new URL(request.url.href);
  const segments = newUrl.pathname.split('/');
  segments[segments.length - 1] = encodeURIComponent(slug);
  newUrl.pathname = segments.join('/');

  return {
    ...request,
    url: newUrl,
    body: null,
  };
}

// Looks up the CMS programmatic-SEO template by matching `templateType` against the
// `templateType` the programmatic-seo-page API resolved (e.g. "Mild Steel") — not the page
// slug, since one CMS template is shared across every location for a given category.
export function buildCmsProgrammaticSeoTemplateRequest(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  const seoPageResponse = prevResponses?.find((r) => r.target === 'programmatic-seo-page');
  const seoPageData =
    seoPageResponse?.success && seoPageResponse.data
      ? seoPageResponse.data?.data ?? seoPageResponse.data
      : null;

  const templateType = String(seoPageData?.templateType ?? '').trim();
  if (!templateType) {
    throw new CustomError(
      'Bad Request: templateType missing from programmatic SEO page response',
      400,
    );
  }

  const query = {
    filters: { templateType: { $eq: templateType } },
    populate: ['faqs', 'sections'],
    pagination: { pageSize: 1, page: 1 },
  };

  const newUrl = new URL(request.url.href);
  newUrl.search = qs.stringify(query);

  return {
    ...request,
    url: newUrl,
    body: null,
  };
}

// Builds the actual products/listing downstream call, enriched with whatever data the
// programmatic-SEO-page lookup returned (e.g. resolved categoryId/location filters).
// Core pagination/identity fields always win over the enrichment data.
export function transformProgrammaticSeoProductsListingRequest(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  const body = request.body ?? {};
  const { offset, limit } = getNormalizedPagination(body);
  const storefront = String(body?.storefront ?? 'msme').trim() || 'msme';

  const seoPageResponse = prevResponses?.find((r) => r.target === 'programmatic-seo-page');
  const seoPageData =
    seoPageResponse?.success && seoPageResponse.data
      ? seoPageResponse.data?.data ?? seoPageResponse.data
      : null;

  // The programmatic page's own slug (e.g. "mild-steel-in-maharashtra") isn't a real
  // category slug the listing API understands. Its `categorySeoSlug` is the resolved,
  // listing-API-compatible category slug — fall back to the request slug if the SEO page
  // lookup failed. Do NOT spread the rest of seoPageData: /central_commerce/products/listing
  // validates its body strictly and 400s on unrecognized fields (pageId, h1, metaTitle, etc.
  // are for seoPageData in the merged response, not for this downstream call).
  const slug = String(seoPageData?.categorySeoSlug ?? '').trim() || getRequiredSlug(body);

  const mergedBody: Record<string, unknown> = {
    offSet: offset,
    limit,
    slug,
    storefront,
    filterConditions: Array.isArray(body.filterConditions) ? body.filterConditions : [],
  };

  if (typeof body.text === 'string' && body.text !== '') {
    mergedBody.text = body.text;
  }

  // Forward state/district exactly as the programmatic-seo-page API returned them, so the
  // listing API can scope results to this SEO page's location.
  if (seoPageData) {
    mergedBody.locationFilters = {
      state: seoPageData.state,
      district: seoPageData.district,
    };
  }

  return {
    ...request,
    body: mergedBody,
    headers: { ...request.headers },
  };
}

// Consolidates the product listing response with the programmatic-SEO page data and the
// CMS SEO template into a single payload. Only a failed product listing fails the whole
// request; SEO/CMS lookups degrade gracefully so a missing programmatic page never breaks the PLP.
export function mergeProgrammaticSeoListingResponse(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const productResponse = responses['products-listing'];
  const seoPageResponse = responses['programmatic-seo-page'];
  const cmsTemplateResponse = responses['cms-plp-programmatic-seo-template'];

  if (!productResponse?.success) {
    const err = new CustomError(
      productResponse?.error || 'Programmatic SEO product listing failed',
      productResponse?.httpStatus ?? 500,
    ) as any;
    err.httpStatusCode = productResponse?.httpStatus ?? 500;
    err.downstreamResponse = productResponse?.downstreamResponse ?? null;
    throw err;
  }

  if (seoPageResponse && !seoPageResponse.success) {
    Logger.warn(`Programmatic SEO page lookup failed: ${seoPageResponse.error}`);
  }

  if (cmsTemplateResponse && !cmsTemplateResponse.success) {
    Logger.warn(`CMS programmatic SEO template lookup failed: ${cmsTemplateResponse.error}`);
  }

  return {
    ...productResponse.data,
    data: {
      ...productResponse.data.data,
      seoPageData: seoPageResponse?.success ? seoPageResponse.data : null,
      seoTemplateData: cmsTemplateResponse?.success ? cmsTemplateResponse.data : null,
    },
  };
}
