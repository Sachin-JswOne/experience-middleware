/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { SlcResponse } from 'src/models/slc-response.model';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
export function convertSlcResponse(response: any): any {
  try {
    if (!response || typeof response !== 'object') {
      return response;
    }
    const newResponse: Record<string, any> = { ...response };
    const slcCart: SlcResponse = {
      numberOfItems: 0,
      totalPrice: 0,
    };
    if (newResponse.data) {
      if (newResponse.data.identifier.journeyType === 'SALES_LEAD_CART') {
        slcCart.numberOfItems = newResponse.data.lineItemList.length;
        slcCart.totalPrice = newResponse.data.totalOrderAmount.displayAmount;
      }
      delete newResponse.slcCartDetails;
      return slcCart;
    } else {
      return {};
    }
  } catch (error) {
    console.error('Error in convertSlcResponse:', error);
    return {};
  }
}
