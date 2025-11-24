/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Logger } from '@nestjs/common';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { mergeGlobalAndSlcCartResponses } from '../global.transformers';

jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  Logger: {
    debug: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    verbose: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('mergeGlobalAndSlcCartResponses', () => {
  const mockGlobalResponseSuccess = {
    target: 'app-global-page-v2',
    success: true,
    data: {
      data: {
        id: 87,
        footer: [
          {
            __component: 'app-components.app-nav-bar-component',
            id: 171,
            navBarItems: [
              { id: 715, name: 'HOME' },
              { id: 716, name: 'CATALOGUE' },
            ],
          },
        ],
        slcCart: {
          __component: 'app-components.app-slc-cart-component',
          description: 'This is a sample cart component',
        },
      },
      meta: {},
    },
  };

  const mockCartDetailsResponseSuccess = {
    target: 'app-slc-cart-details',
    success: true,
    data: { numberOfItems: 2, totalPrice: '11,668.78' },
  };

  beforeEach(() => {
    (Logger.debug as jest.Mock).mockClear();
  });

  it('should merge cart details into global response when both are successful and slcCart exists', () => {
    const aggregatedResponses: AggregatedResponse[] = [
      mockGlobalResponseSuccess,
      mockCartDetailsResponseSuccess,
    ];

    const result = mergeGlobalAndSlcCartResponses(aggregatedResponses);

    expect(result).toBeDefined();
    expect(result.data.slcCart).toBeDefined();
    expect(result.data.slcCart.numberOfItems).toBe(2);
    expect(result.data.slcCart.totalPrice).toBe('11,668.78');
    expect(result.data.id).toBe(87);
  });

  it('should return global response data when both are successful but slcCart does not exist', () => {
    const globalResponseWithoutSlcCart = JSON.parse(
      JSON.stringify(mockGlobalResponseSuccess),
    );
    delete globalResponseWithoutSlcCart.data.data.slcCart;

    const aggregatedResponses: AggregatedResponse[] = [
      globalResponseWithoutSlcCart,
      mockCartDetailsResponseSuccess,
    ];

    const result = mergeGlobalAndSlcCartResponses(aggregatedResponses);

    expect(result).toEqual(globalResponseWithoutSlcCart.data);
    expect(result.data.slcCart).toBeUndefined();
  });

  it('should return an empty object when both responses are unsuccessful', () => {
    const aggregatedResponses: AggregatedResponse[] = [
      { ...mockGlobalResponseSuccess, success: false, data: null },
      { ...mockCartDetailsResponseSuccess, success: false, data: null },
    ];

    const result = mergeGlobalAndSlcCartResponses(aggregatedResponses);

    expect(result).toEqual({ data: {}, meta: {} });
  });

  it('should return undefined if the global page response is unsuccessful but cart details are successful', () => {
    const aggregatedResponses: AggregatedResponse[] = [
      { ...mockGlobalResponseSuccess, success: false, data: null },
      mockCartDetailsResponseSuccess,
    ];

    const result = mergeGlobalAndSlcCartResponses(aggregatedResponses);

    expect(result).toBeUndefined();
  });

  it('should return undefined if the global page response is missing', () => {
    const aggregatedResponses: AggregatedResponse[] = [
      mockCartDetailsResponseSuccess,
    ];

    const result = mergeGlobalAndSlcCartResponses(aggregatedResponses);

    expect(result).toBeUndefined();
  });

  it('should return undefined for an empty array of responses', () => {
    const aggregatedResponses: AggregatedResponse[] = [];
    const result = mergeGlobalAndSlcCartResponses(aggregatedResponses);
    expect(result).toBeUndefined();
  });
});
