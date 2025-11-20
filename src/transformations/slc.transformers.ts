/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { SlcResponse } from 'src/models/slc-response.model';
import { Logger } from '@nestjs/common';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
export function convertSlcResponse(response: any): any {
  try {
    if (!response || typeof response !== 'object') {
      Logger.error(`Error for SLC API method: convertSlcResponse Response is not an object`);
      return response;
    }
    const newResponse: Record<string, any> = { ...response };
    const slcCart: SlcResponse = {
      numberOfItems: 0,
      totalPrice: 0,
    };
    if (newResponse.data) {
      if (newResponse.data.identifier?.journeyType === 'SALES_LEAD_CART') {
        slcCart.numberOfItems = newResponse.data.lineItemList.length;
        slcCart.totalPrice = newResponse.data.totalOrderAmount.displayAmount;
      }
      delete newResponse.slcCartDetails;
      if (slcCart.totalPrice && slcCart.numberOfItems > 0) {
        return slcCart;
      } else {
        return {};
      }
    } else {
      return {};
    }
  } catch (error) {
    Logger.error(`Error for SLC API method: convertSlcResponse Error in convertSlcResponse: ${error}`);
    console.error('Error in convertSlcResponse:', error);
    return {};
  }
}
