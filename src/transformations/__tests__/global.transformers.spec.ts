/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
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

  const slcCartResponse: AggregatedResponse = {
    target: 'app-slc-cart-details',
    success: true,
    data: { numberOfItems: 10, totalPrice: 20 },
  };

  it('should return empty object when no responses are provided', () => {
    const result = mergeGlobalAndSlcCartResponses([]);
    expect(result).toEqual({ data: {}, meta: {} });
  });

  it('should return empty object when both responses are unsuccessful', () => {
    const result = mergeGlobalAndSlcCartResponses([
      { target: 'app-global-page-v2', success: false, data: {} },
      { target: 'app-slc-cart-details', success: false, data: {} },
    ]);
    expect(result).toEqual({ data: {}, meta: {} });
  });

  it('should return global page data when cart details fail', () => {
    const result = mergeGlobalAndSlcCartResponses([
      globalPageResponse,
      { target: 'app-slc-cart-details', success: false, data: {} },
    ]);
    expect(result).toEqual(globalPageResponse.data);
  });

  it('should merge cart details into global page footer when both succeed', () => {
    const result = mergeGlobalAndSlcCartResponses([
      globalPageResponse,
      slcCartResponse,
    ]);

    const slcCartComponent = result.data.footer.find(
      (footer: any) => footer.__component === 'app-components.app-slc-cart',
    );

    expect(slcCartComponent.cartSummary).toEqual({
      numberOfItems: 10,
      totalPrice: 20,
    });
  });

  it('should return global page data unchanged if cart component not found', () => {
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
    ]);

    expect(result).toEqual(globalPageWithoutCart.data);
  });
});
