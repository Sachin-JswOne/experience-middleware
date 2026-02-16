import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';

export function mergeGlobalAndSlcCartResponses(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const appGlobalPageResponse = responses['app-global-page-v2'];
  const appSlcCartDetailsResponse = responses['app-slc-cart-details'];
  const appCartSizeResponse = responses['app-cart-size'];

  Logger.debug(
    ` Strapi Global Page Api response from method: mergeGlobalAndSlcCartResponses : ${JSON.stringify(
      appGlobalPageResponse,
    )}`,
  );

  Logger.debug(
    ` Slc Cart Api response from method: mergeGlobalAndSlcCartResponses : ${JSON.stringify(
      appSlcCartDetailsResponse,
    )}`,
  );

  Logger.debug(
    ` Cart Size response from method: mergeGlobalAndSlcCartResponses : ${JSON.stringify(
      appCartSizeResponse,
    )}`,
  );

  if (appGlobalPageResponse && appSlcCartDetailsResponse) {
    if (appCartSizeResponse.success) {
      if (
        appGlobalPageResponse?.data?.data?.footer &&
        Array.isArray(appGlobalPageResponse?.data?.data?.footer)
      ) {
        appGlobalPageResponse.data.data.footer.push({
          __component: 'cart-size',
          cartData: appCartSizeResponse?.data.data,
        });
      }
    }

    if (!appCartSizeResponse.success) {
      if (
        appGlobalPageResponse?.data?.data?.footer &&
        Array.isArray(appGlobalPageResponse?.data?.data?.footer)
      ) {
        appGlobalPageResponse.data.data.footer.push({
          __component: 'cart-size',
          cartData: {},
        });
      }
    }
    if (!appGlobalPageResponse.success && !appSlcCartDetailsResponse.success) {
      return { data: {}, meta: {} };
    }

    if (appGlobalPageResponse.success && !appSlcCartDetailsResponse.success) {
      return appGlobalPageResponse.data;
    }

    if (appGlobalPageResponse.success && appSlcCartDetailsResponse.success) {
      const responseData = { ...appGlobalPageResponse.data };

      if (responseData.data.footer && Array.isArray(responseData.data.footer)) {
        const slcCartComponent = responseData.data.footer.find(
          (footer) => footer.__component === 'app-components.app-slc-cart',
        );
        if (slcCartComponent) {
          slcCartComponent.cartSummary = {
            numberOfItems: appSlcCartDetailsResponse?.data?.numberOfItems,
            totalPrice: appSlcCartDetailsResponse?.data?.totalPrice,
          };

          return responseData;
        }
        return responseData;
      }
    }
  }
  return { data: {}, meta: {} };
}
