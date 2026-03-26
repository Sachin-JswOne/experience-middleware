import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug, safeToLog } from 'src/utils/common-functions.util';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';

export function selectSlugProductResponse(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  safeDebug(
    Logger,
    () =>
      `cmsFeatureFlag response from selectSlugProductResponse: ${safeToLog(
        responses['cmsFeatureFlag'],
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      `product-by-slug-old response from selectSlugProductResponse: ${safeToLog(
        responses['product-by-slug-old'],
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      `product-by-slug-v2 response from selectSlugProductResponse: ${safeToLog(
        responses['product-by-slug-v2'],
      )}`,
  );

  const featureFlags = responses['cmsFeatureFlag']?.data?.data ?? [];

  const isCentralCatalogueEnabled =
    Array.isArray(featureFlags) &&
    featureFlags.some((f: any) => f?.name === 'central_catalogue_global' && f?.isActive === true);

  const selectedResponse = isCentralCatalogueEnabled
    ? responses['product-by-slug-v2']
    : responses['product-by-slug-old'];

  if (selectedResponse?.success) {
    return selectedResponse.data;
  }

  Logger.error(`[selectSlugProductResponse] Selected target failed: ${selectedResponse?.target}`);

  const downstreamStatus =
    selectedResponse?.downstreamResponse?.status ?? selectedResponse?.httpStatus ?? 500;

  const downstreamMessage =
    selectedResponse?.error || selectedResponse?.downstreamResponse?.error || 'Request failed';

  const error: any = new CustomError(downstreamMessage, downstreamStatus);
  error.httpStatusCode = downstreamStatus;
  error.downstreamResponse = selectedResponse?.downstreamResponse ?? null;

  throw error;
}

export function buildProductSlugV2Request(request: BaseRequest): BaseRequest {
  const url = new URL(request.url.href);

  if (!url.searchParams.has('isDirect')) {
    url.searchParams.set('isDirect', 'false');
  }

  return {
    ...request,
    url,
    body: undefined,
  };
}
