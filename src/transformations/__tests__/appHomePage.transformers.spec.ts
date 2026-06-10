/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unused-vars */

jest.mock('./../web.transformers', () => ({
  normalizeRecentlyViewedProducts: jest.fn(() => [
    {
      mmid: '1000-10005',
      productTitle: 'JSW Steel Hot Rolled Sheets IS 2062:2011 E350A',
      imageUrl:
        'https://catalogue-assets.qa.jsw1msme.in/assets/media/aeca9767-a194-45ea-88bd-9f51b4ba4f80',
      productSlug: 'jsw-steel-hot-rolled-sheet-2062-2011-e350a',
    },
  ]),
}));
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mergeAppHomePageResponses, mergeAppHomePageResponseV4 } from '../appHomePage.transformers';
import { responses } from './__mocks__/appHomePageV4MockData';
// import * as RecentlyViewed from './../web.transformers';

describe('mergeAppHomePageResponses', () => {
  let aggregatedResponses: any[];

  beforeEach(() => {
    aggregatedResponses = [
      {
        target: 'app-home-page',
        data: {
          data: {
            id: 4,
            blocks: [
              {
                __component: 'app-components.app-buy-again',
                id: 1,
              },
              {
                __component: 'app-components.app-category-component',
                id: 2,
                web_central_catalogue_categories: [
                  { categoryId: 'cat-1' },
                  { categoryId: 'cat-2' },
                ],
              },
              {
                __component: 'app-components.app-top-brands',
                id: 3,
                web_central_catalogue_categories: [
                  { categoryId: 'brand-1' },
                  { categoryId: 'brand-2' },
                ],
              },
            ],
          },
        },
      },
      {
        target: 'app-buy-again',
        data: {
          listOfBuyAgainProducts: [{ mmid: '1001', name: 'Product 1' }],
        },
      },
      {
        target: 'app-top-brands',
        success: true,
        data: {
          data: {
            navigation: [
              {
                subMenu: [
                  {
                    id: 'brand-1',
                    name: 'Brand 1',
                    slug: 'brand-1',
                    metaImage: { url: 'img1.png' },
                  },
                  {
                    id: 'brand-x',
                    name: 'Brand X',
                    slug: 'brand-x',
                    metaImage: { url: 'imgX.png' },
                  },
                ],
              },
            ],
          },
        },
      },
      {
        target: 'app-categories',
        success: true,
        data: {
          data: {
            navigation: [
              {
                subMenu: [
                  {
                    id: 'cat-1',
                    name: 'Category 1',
                    slug: 'cat-1',
                    metaImage: { url: 'cat1.png' },
                  },
                  {
                    id: 'cat-x',
                    name: 'Category X',
                    slug: 'cat-x',
                    metaImage: { url: 'catX.png' },
                  },
                ],
              },
            ],
          },
        },
      },
    ];
    aggregatedResponses.push({
      target: 'app-in-transit',
      success: true,
      data: {
        success: true,
        data: {
          success: true,
          response: {
            data: [{ id: 1 }],
          },
        },
      },
    });
  });

  it('should merge all responses correctly', () => {
    const result = mergeAppHomePageResponses(aggregatedResponses);

    const blocks = result.data.blocks;

    // Buy Again
    const buyAgainBlock = blocks.find((b: any) => b.__component === 'app-components.app-buy-again');
    expect(buyAgainBlock.listOfBuyAgainProducts).toHaveLength(1);

    // Categories
    const categoryBlock = blocks.find(
      (b: any) => b.__component === 'app-components.app-category-component',
    );
    expect(categoryBlock.centralCatalogueCategoriesList).toEqual([
      {
        name: 'Category 1',
        slug: 'cat-1',
        image: 'cat1.png',
      },
    ]);

    // Top Brands
    const brandBlock = blocks.find((b: any) => b.__component === 'app-components.app-top-brands');
    expect(brandBlock.centralCatalogueBrandsList).toEqual([
      {
        name: 'Brand 1',
        slug: 'brand-1',
        image: 'img1.png',
      },
    ]);
  });

  it('should return empty object if strapi response missing', () => {
    const result = mergeAppHomePageResponses([]);

    expect(result).toEqual({
      data: {},
      meta: {},
    });
  });

  it('should not inject buy again if not array', () => {
    const modified = aggregatedResponses.filter((r) => r.target !== 'app-buy-again');

    const result = mergeAppHomePageResponses(modified);

    const buyAgainBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-buy-again',
    );

    expect(buyAgainBlock.listOfBuyAgainProducts).toBeUndefined();
  });

  it('should not inject brands if no matching IDs', () => {
    aggregatedResponses[0].data.data.blocks[2].web_central_catalogue_categories = [
      { categoryId: 'invalid' },
    ];

    const result = mergeAppHomePageResponses(aggregatedResponses);

    const brandBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-top-brands',
    );

    expect(brandBlock.centralCatalogueBrandsList).toEqual([]);
  });

  it('should not inject categories if no matching IDs', () => {
    aggregatedResponses[0].data.data.blocks[1].web_central_catalogue_categories = [
      { categoryId: 'invalid' },
    ];

    const result = mergeAppHomePageResponses(aggregatedResponses);

    const categoryBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-category-component',
    );

    expect(categoryBlock.centralCatalogueCategoriesList).toEqual([]);
  });

  it('should set inTransit = true when data present', () => {
    aggregatedResponses[0].data.data.blocks.push({
      __component: 'app-components.app-link-banner',
      id: 10,
    });

    const result = mergeAppHomePageResponses(aggregatedResponses);

    const bannerBlock = result.data.blocks.find(
      (b: any) => b.__component === 'app-components.app-link-banner',
    );

    expect(bannerBlock.inTransit).toBe(true);
  });
});

describe.only('mergeAppHomePageResponseV4', () => {
  let aggregatedResponses: any[];

  beforeEach(() => {
    aggregatedResponses = responses;
    aggregatedResponses.push({
      target: 'app-in-transit',
      success: true,
      data: {
        success: true,
        data: {
          success: true,
          response: {
            data: [{ id: 1 }],
          },
        },
      },
    });
  });

  it('should return empty response when cms response is invalid', () => {
    const result = mergeAppHomePageResponseV4([]);

    expect(result).toEqual({
      data: {},
      meta: {},
    });
  });

  it('should fallback to app-home-page when layout-mweb-homepages is absent', () => {
    const responses = [
      {
        target: 'app-home-page',
        success: true,
        data: {
          data: {
            id: 4,
            blocks: [
              {
                __component: 'app-components.app-buy-again',
                id: 1,
              },
              {
                __component: 'app-components.app-category-component',
                id: 2,
                web_central_catalogue_categories: [
                  { categoryId: 'cat-1' },
                  { categoryId: 'cat-2' },
                ],
              },
              {
                __component: 'app-components.app-top-brands',
                id: 3,
                web_central_catalogue_categories: [
                  { categoryId: 'brand-1' },
                  { categoryId: 'brand-2' },
                ],
              },
            ],
          },
        },
      },
    ];

    const result = mergeAppHomePageResponseV4(responses as any);

    expect(result.data).toBeDefined();
  });

  it('should inject blogs into blog_list_component_material_matter', () => {
    const result = mergeAppHomePageResponseV4(aggregatedResponses);

    expect(result.data[0].blog_list_component_material_matter.blogs).toBeDefined();
  });

  it('should inject buy again products', () => {
    const result = mergeAppHomePageResponseV4(aggregatedResponses);

    expect(result.data[0].buy_again_component).toBeDefined();
  });

  it('should map CCP products into top items', () => {
    const result = mergeAppHomePageResponseV4(aggregatedResponses);

    expect(result.data[0].mweb_top_item).toBeDefined();
    expect(result.data[0].mweb_top_item.app_search_top_items[0].MMID).toBe('1001-10007');
  });

  it('should populate central catalogue brand list in Top Brands', () => {
    const result = mergeAppHomePageResponseV4(aggregatedResponses);

    expect(result.data[0].top_brand_component).toBeDefined();

    expect(result.data[0].top_brand_component.centralCatalogueBrandsList).toContainEqual(
      expect.objectContaining({
        name: 'JSW Steel',
        slug: 'jsw-steel',
      }),
    );
  });

  it('should populate product category list in Categories', () => {
    const result = mergeAppHomePageResponseV4(aggregatedResponses);

    expect(result.data[0].category_component).toBeDefined();
    expect(result.data[0].category_component.product_categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: 'JSW Steel products',
          description: 'Cold Rolled Sheets & Coils',
        }),
      ]),
    );
  });

  it('should set inTransit to true when transit data exists', () => {
    const result = mergeAppHomePageResponseV4(aggregatedResponses);

    expect(result.data[0].link_banner_component.inTransit).toBe(true);
  });

  it('should filter removed recently viewed products', () => {
    const result = mergeAppHomePageResponseV4(aggregatedResponses);

    expect(result.data[0].recently_viewed_component).toBeDefined();
    expect(result.data[0].recently_viewed_component.recentlyViewedProducts).toContainEqual(
      expect.objectContaining({
        mmid: '1000-10005',
      }),
    );
  });
});
