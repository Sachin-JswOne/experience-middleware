import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { inspect } from 'util';
const EMPTY_GLOBAL_RESPONSE = { data: {}, meta: {} };

function mapResponsesByTarget(
  aggregatedResponses: AggregatedResponse[],
): Record<string, AggregatedResponse> {
  return aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
}

function getFooter(globalResponse?: AggregatedResponse): any[] | null {
  const footer = globalResponse?.data?.data?.footer;
  return Array.isArray(footer) ? footer : null;
}

function injectCartSize(
  appGlobalPageResponse?: AggregatedResponse,
  appCartSizeResponse?: AggregatedResponse,
): void {
  const footer = getFooter(appGlobalPageResponse);

  if (!footer || !appCartSizeResponse) {
    return;
  }

  footer.push({
    __component: 'cart-size',
    cartData: appCartSizeResponse.success ? appCartSizeResponse.data?.data : {},
  });
}

function injectSlcCartSummary(responseData: any, appSlcCartDetailsResponse: AggregatedResponse): any {
  const footer = responseData?.data?.footer;

  if (!Array.isArray(footer)) {
    return responseData;
  }

  const slcCartComponent = footer.find(
    (footerItem) => footerItem.__component === 'app-components.app-slc-cart',
  );

  if (!slcCartComponent) {
    return responseData;
  }

  slcCartComponent.cartSummary = {
    numberOfItems: appSlcCartDetailsResponse?.data?.numberOfItems,
    totalPrice: appSlcCartDetailsResponse?.data?.totalPrice,
  };

  return responseData;
}

export function mergeGlobalAndSlcCartResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = mapResponsesByTarget(aggregatedResponses);

  const appGlobalPageResponse = responses['app-global-page-v2'];
  const appSlcCartDetailsResponse = responses['app-slc-cart-details'];
  const appCartSizeResponse = responses['app-cart-size'];

  Logger.debug(
    ` Strapi Global Page Api response from method: mergeGlobalAndSlcCartResponses : {success: ${appGlobalPageResponse?.success}, data: ${inspect(appGlobalPageResponse?.data, { depth: null })},}`,
  );

  Logger.debug(
    ` Slc Cart Api response from method: mergeGlobalAndSlcCartResponses : {success: ${appSlcCartDetailsResponse?.success}, data: ${inspect(appSlcCartDetailsResponse?.data, { depth: null })},}`,
  );

  Logger.debug(
    ` Cart Size response from method: mergeGlobalAndSlcCartResponses : {success: ${appCartSizeResponse?.success}, data: ${inspect(appCartSizeResponse?.data, { depth: null })},}`,
  );

  if (!appGlobalPageResponse || !appSlcCartDetailsResponse) {
    return EMPTY_GLOBAL_RESPONSE;
  }

  injectCartSize(appGlobalPageResponse, appCartSizeResponse);

  if (!appGlobalPageResponse.success && !appSlcCartDetailsResponse.success) {
    return EMPTY_GLOBAL_RESPONSE;
  }

  if (appGlobalPageResponse.success && !appSlcCartDetailsResponse.success) {
    return appGlobalPageResponse.data;
  }

  if (!appGlobalPageResponse.success || !appSlcCartDetailsResponse.success) {
    return EMPTY_GLOBAL_RESPONSE;
  }

  const responseData = { ...appGlobalPageResponse.data };
  return injectSlcCartSummary(responseData, appSlcCartDetailsResponse);
}