/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';

export function mergeGlobalAndSlcCartResponses(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const appGlobalPageResponse = responses['app-global-page-v2'];
  const appSlcCartDetailsResponse = responses['app-slc-cart-details'];

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

  if (appGlobalPageResponse && appSlcCartDetailsResponse) {
    if (!appGlobalPageResponse.success && !appSlcCartDetailsResponse.success) {
      return { data: {}, meta: {} };
    }

    if (appGlobalPageResponse.success && !appSlcCartDetailsResponse.success) {
      return appGlobalPageResponse.data;
    }

    if (appGlobalPageResponse.success && appSlcCartDetailsResponse.success) {
      const responseData = { ...appGlobalPageResponse.data };

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
  return { data: {}, meta: {} };
}
