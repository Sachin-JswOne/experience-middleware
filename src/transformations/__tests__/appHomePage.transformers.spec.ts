/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { mergeAppHomePageResponses } from '../appHomePage.transformers';

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
