// import { Logger } from '@nestjs/common';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { mergeGlobalAndSlcCartResponses } from '../global.transformers';

describe('mergeGlobalAndSlcCartResponses', () => {
  const globalPageResponse: AggregatedResponse = {
    target: 'app-global-page-v2',
    success: true,
    data: {
      data: {
        id: 2,
        documentId: 'ttej524ehj3ww42k1ajv1kud',
        createdAt: '2025-11-25T08:04:31.847Z',
        updatedAt: '2025-11-25T08:04:31.847Z',
        publishedAt: '2025-11-25T08:04:34.408Z',
        footer: [
          {
            __component: 'app-components.app-nav-bar-component',
            id: 177,
            navBarItems: [],
          },
          {
            __component: 'app-components.app-slc-cart',
            id: 2,
            name: 'slc visible cart',
          },
        ],
      },
      meta: {},
    },
  };

  const cartSizeResponse: AggregatedResponse = {
    target: 'app-cart-size',
    success: true,
    data: {
      status: 'OK',
      data: {
        enquiryCart: {
          id: 'f623e250-d0b0-42a3-b796-d72e1ac616bc',
          version: '66',
          lineItemCount: 1,
          latestLineItem: {
            lineItemId: '46162f5c-54b7-42b4-993a-4c1efcd9ffe8',
            imageUrl: 'test-url',
          },
        },
        orderCart: {
          id: null,
          version: null,
          lineItemCount: 0,
          latestLineItem: null,
        },
      },
      error: null,
      success: true,
    },
  };

  const slcCartResponse: AggregatedResponse = {
    target: 'app-slc-cart-details',
    success: true,
    data: { numberOfItems: 10, totalPrice: 20 },
  };

  it('should return empty object when no responses are provided', () => {
    const result = mergeGlobalAndSlcCartResponses([]);
    expect(result).toEqual({ data: {}, meta: {} });
  });

  it('should return empty object when all the responses are unsuccessful', () => {
    const result = mergeGlobalAndSlcCartResponses([
      { target: 'app-global-page-v2', success: false, data: {} },
      { target: 'app-slc-cart-details', success: false, data: {} },
      { target: 'app-cart-size', success: false, data: {} },
    ]);

    expect(result).toEqual({ data: {}, meta: {} });
  });

  it('should return global page data when cart details fail', () => {
    const result = mergeGlobalAndSlcCartResponses([
      globalPageResponse,
      { target: 'app-slc-cart-details', success: false, data: {} },
      cartSizeResponse,
    ]);

    expect(result).toEqual(globalPageResponse.data);
  });

  it('should merge cart details and cart size into footer when both succeed', () => {
    const result = mergeGlobalAndSlcCartResponses([
      globalPageResponse,
      slcCartResponse,
      cartSizeResponse,
    ]);

    const slcCartComponent = result.data.footer.find(
      (footer: any) => footer.__component === 'app-components.app-slc-cart',
    );

    const cartSizeComponent = result.data.footer.find(
      (footer: any) => footer.__component === 'cart-size',
    );

    expect(slcCartComponent.cartSummary).toEqual({
      numberOfItems: 10,
      totalPrice: 20,
    });

    expect(cartSizeComponent.cartData).toEqual(cartSizeResponse.data.data);
  });

  it('should return global page data and still append cart-size when cart component not found', () => {
    const globalPageWithoutCart = {
      ...globalPageResponse,
      data: {
        ...globalPageResponse.data,
        data: {
          ...globalPageResponse.data.data,
          footer: [
            {
              __component: 'app-components.app-nav-bar-component',
              id: 177,
              navBarItems: [],
            },
          ],
        },
      },
    };

    const result = mergeGlobalAndSlcCartResponses([
      globalPageWithoutCart,
      slcCartResponse,
      cartSizeResponse,
    ]);

    const cartSizeComponent = result.data.footer.find(
      (footer: any) => footer.__component === 'cart-size',
    );

    expect(cartSizeComponent).toBeDefined();
  });
});
