/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { mergeCartPageResponses } from '../cart.transformers';
import { AggregatedResponse } from 'src/models/aggregated-response.model';

describe('mergeCartPageResponses', () => {
  const mockStrapiCartPageResponse = {
    target: 'app-cart-page',
    success: true,
    data: {
      data: {
        id: 4,
        documentId: 't91ktn08jt7535wjrkk1kn5w',
        createdAt: '2025-09-05T12:51:06.249Z',
        updatedAt: '2025-09-10T05:36:23.841Z',
        publishedAt: '2025-09-10T05:36:24.896Z',
        blocks: [
          {
            __component: 'app-components.app-cart-component',
            id: 4,
            customerCreateCart: {
              id: 998,
              title: null,
              height: 114,
              banners: [
                {
                  id: 2473,
                  image: {
                    id: 1676,
                    documentId: 'fajv9y1zjnaxtmxyas44j1qj',
                    url: 'https://storage.googleapis.com/public-jsw-msme-cms-storage-qa-service/PDP_trustbuildingbanner_524d9ca62b/PDP_trustbuildingbanner_524d9ca62b.png',
                    alternativeText: 'PDP_trustbuildingbanner',
                    name: 'PDP_trustbuildingbanner.png',
                  },
                  action: null,
                  banner_category: null,
                },
              ],
            },
          },
          {
            __component: 'app-components.app-buy-again',
            id: 243,
            title: 'Buy Again',
            itemsToShow: 4,
          },
          {
            __component: 'app-components.app-cart-product',
            id: 4,
            title: 'products',
          },
        ],
      },
      meta: {},
    },
  };

  const mockBuyAgainApiResponse = {
    target: 'app-buy-again',
    success: true,
    data: {
      listOfBuyAgainProducts: [{ id: 1, name: 'Product A' }],
    },
  };

  const mockCartSummaryApiResponse = {
    target: 'app-cart-summary',
    success: true,
    data: {
      cartId: 2612,
      soldBy: 'JSW One Distribution Limited',
      availableProducts: [{ id: 2, name: 'Product B' }],
      unavailableProducts: [],
    },
  };

  it('should merge all responses correctly when all are present', () => {
    const aggregatedResponses: AggregatedResponse[] = [
      JSON.parse(JSON.stringify(mockStrapiCartPageResponse)),
      mockBuyAgainApiResponse,
      mockCartSummaryApiResponse,
    ];

    const result = mergeCartPageResponses(aggregatedResponses);

    const buyAgainBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-buy-again',
    );
    const cartProductBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-cart-product',
    );

    expect(buyAgainBlock.listOfBuyAgainProducts).toEqual(
      mockBuyAgainApiResponse.data.listOfBuyAgainProducts,
    );
    expect(cartProductBlock.cartSummary).toEqual(
      mockCartSummaryApiResponse.data,
    );
    expect(result.data.id).toBe(4);
  });

  it('should return an empty data object if strapi response is missing', () => {
    const aggregatedResponses: AggregatedResponse[] = [
      mockBuyAgainApiResponse,
      mockCartSummaryApiResponse,
    ];
    const result = mergeCartPageResponses(aggregatedResponses);
    expect(result).toEqual({ data: {}, meta: {} });
  });

  it('should return an empty data object if strapi response data is not an object', () => {
    const invalidStrapiResponse = {
      ...mockStrapiCartPageResponse,
      data: null,
    };
    const aggregatedResponses: AggregatedResponse[] = [
      invalidStrapiResponse as any,
    ];
    const result = mergeCartPageResponses(aggregatedResponses);
    expect(result).toEqual({ data: {}, meta: {} });
  });

  it('should handle missing buy again api response gracefully', () => {
    const aggregatedResponses: AggregatedResponse[] = [
      JSON.parse(JSON.stringify(mockStrapiCartPageResponse)),
      mockCartSummaryApiResponse,
    ];
    const result = mergeCartPageResponses(aggregatedResponses);
    const buyAgainBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-buy-again',
    );

    expect(buyAgainBlock.listOfBuyAgainProducts).toBeUndefined();
  });

  it('should handle missing cart summary api response gracefully', () => {
    const aggregatedResponses: AggregatedResponse[] = [
      JSON.parse(JSON.stringify(mockStrapiCartPageResponse)),
      mockBuyAgainApiResponse,
    ];

    const result = mergeCartPageResponses(aggregatedResponses);

    const cartProductBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-cart-product',
    );
    expect(cartProductBlock.cartSummary).toBeUndefined();
  });

  it('should handle missing blocks array in strapi response', () => {
    const strapiResponseWithoutBlocks = JSON.parse(
      JSON.stringify(mockStrapiCartPageResponse),
    );
    delete strapiResponseWithoutBlocks.data.data.blocks;

    const aggregatedResponses: AggregatedResponse[] = [
      strapiResponseWithoutBlocks,
      mockBuyAgainApiResponse,
      mockCartSummaryApiResponse,
    ];

    const result = mergeCartPageResponses(aggregatedResponses);
    expect(result).toEqual({ data: {}, meta: {} });
  });

  it('should handle missing buy again block in strapi response', () => {
    const strapiResponseWithoutBuyAgainBlock = JSON.parse(
      JSON.stringify(mockStrapiCartPageResponse),
    );
    strapiResponseWithoutBuyAgainBlock.data.data.blocks =
      strapiResponseWithoutBuyAgainBlock.data.data.blocks.filter(
        (b: any) => b.__component !== 'app-components.app-buy-again',
      );

    const aggregatedResponses: AggregatedResponse[] = [
      strapiResponseWithoutBuyAgainBlock,
      mockBuyAgainApiResponse,
      mockCartSummaryApiResponse,
    ];

    const result = mergeCartPageResponses(aggregatedResponses);
    const buyAgainBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-buy-again',
    );
    expect(buyAgainBlock).toBeUndefined();
    const cartProductBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-cart-product',
    );
    expect(cartProductBlock.cartSummary).toEqual(
      mockCartSummaryApiResponse.data,
    );
  });

  it('should handle missing cart product block in strapi response', () => {
    const strapiResponseWithoutCartProductBlock = JSON.parse(
      JSON.stringify(mockStrapiCartPageResponse),
    );
    strapiResponseWithoutCartProductBlock.data.data.blocks =
      strapiResponseWithoutCartProductBlock.data.data.blocks.filter(
        (b: any) => b.__component !== 'app-components.app-cart-product',
      );

    const aggregatedResponses: AggregatedResponse[] = [
      strapiResponseWithoutCartProductBlock,
      mockBuyAgainApiResponse,
      mockCartSummaryApiResponse,
    ];

    const result = mergeCartPageResponses(aggregatedResponses);
    const cartProductBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-cart-product',
    );
    expect(cartProductBlock).toBeUndefined();
    const buyAgainBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-buy-again',
    );
    expect(buyAgainBlock.listOfBuyAgainProducts).toEqual(
      mockBuyAgainApiResponse.data.listOfBuyAgainProducts,
    );
  });
});
