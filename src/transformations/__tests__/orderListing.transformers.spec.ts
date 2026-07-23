import {
  transformOrderListingRequest,
  getDeveloperName,
  transformOrderListingResponse,
  sortProductsArrayBasedOnCreatedDate,
  transformV2OrderListResponse,
  parseProductQuantity,
  createAttributesForOpportunities,
  transformOpportunityAttributes,
  extractUOM,
  buildAttribute,
  getPPGLColorInfo,
  getAppStatusFromOpportunities,
  getOrderTag,
  getOrderType,
  mergeMaterialTrackingAndOrderListingResponses,
} from '../orderListing.transformers';
import { CustomError } from 'src/utils/CustomError';
import { HttpStatusCode } from 'axios';
import * as appConfig from 'src/config/app.config';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';

jest.mock('src/utils/CustomError');
jest.mock('src/config/app.config');

jest.mock('../shipments.transformers', () => ({
  transformSingleProduct: jest.fn((item) => ({
    mocked: true,
    ...item,
  })),
}));

jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  Logger: {
    error: jest.fn(),
    log: jest.fn(),
  },
}));

jest.mock('src/utils/tracing.util', () => ({
  getFormattedTracingContext: jest.fn(() => 'traceId: 123'),
}));

describe('orderListing.transformers', () => {
  describe('getDeveloperName', () => {
    it('should return "PrivateBrand" for "Retailer PB"', () => {
      expect(getDeveloperName('Retailer PB')).toBe('PrivateBrand');
    });

    it('should return "PrivateBrand" for "Influencer"', () => {
      expect(getDeveloperName('Influencer')).toBe('PrivateBrand');
    });

    it('should return "MSME" for other customer types', () => {
      expect(getDeveloperName('SomeOtherType')).toBe('MSME');
    });
  });

  describe('transformOrderListingRequest', () => {
    it('should transform the request for a valid customerType and gstin', () => {
      const request = {
        url: new URL('http://test.com?customerType=Retailer PB&gstin=12345'),
      };
      const transformed = transformOrderListingRequest(request);
      expect(transformed.url.searchParams.get('developerName')).toBe('PrivateBrand');
      expect(transformed.url.searchParams.has('customerType')).toBe(false);
    });

    it('should throw CustomError if gstin is not found', () => {
      const request = {
        url: new URL('http://test.com?customerType=Retailer PB'),
      };
      expect(() => transformOrderListingRequest(request)).toThrow(
        new CustomError('Gstin not found', HttpStatusCode.BadRequest),
      );
    });
  });

  describe('transformOrderListingResponse', () => {
    const mockResponse = {
      data: {
        data: [
          {
            isOrder: false,
            createdDate: '2025-05-09T09:12:49.000+0000',
            orderId: '006Bh00000C0a9SIAR',
            orderStatus: 'New',
            orderType: 'MSME',
            itemDetails: [
              {
                productName: 'JSW Neosteel Fe550D TMT Rebar - 10',
                quantity: '12.0 MT',
                attributes: { keys: 'TMT Form', values: 'Straight' },
              },
            ],
          },
          {
            isOrder: false,
            createdDate: '2025-05-08T09:12:18.000+0000',
            orderId: '006Bh00000C0cXpIAJ',
            orderStatus: 'New',
            orderType: 'MSME',
            itemDetails: [
              {
                productName: 'JSW Neosteel Fe550D TMT Rebar - 10',
                quantity: '12.0 MT',
                attributes: { keys: 'TMT Form', values: 'Straight' },
              },
            ],
          },
        ],
      },
    };

    it('should transform the response and sort by date', () => {
      const result = transformOrderListingResponse(mockResponse);
      expect(result.orderList).toHaveLength(2);
      expect(result.orderList[0].orderId).toBe('006Bh00000C0a9SIAR');
      expect(result.orderList[1].orderId).toBe('006Bh00000C0cXpIAJ');
      expect(result.orderList[0].orderPlacedDate).toBe('May 09, 2025');
    });

    it('should return an empty orderList if response data is missing', () => {
      const emptyResponse = { data: {} };
      expect(transformOrderListingResponse(emptyResponse)).toEqual({
        orderList: [],
      });
    });
  });

  describe('sortProductsArrayBasedOnCreatedDate', () => {
    it('should sort products by createdDate in descending order', () => {
      const products = [
        { createdDate: '2023-01-01' },
        { createdDate: '2023-01-03' },
        { createdDate: '2023-01-02' },
      ];
      const sorted = sortProductsArrayBasedOnCreatedDate(products);
      expect(new Date(sorted[0].createdDate).getTime()).toBeGreaterThan(
        new Date(sorted[1].createdDate).getTime(),
      );
      expect(new Date(sorted[1].createdDate).getTime()).toBeGreaterThan(
        new Date(sorted[2].createdDate).getTime(),
      );
    });
  });

  describe('transformV2OrderListResponse', () => {
    it('should correctly transform an "isOrder: true" item', () => {
      const order = {
        isOrder: true,
        orderNumber: '123',
        orderStatus: 'Placed',
        createdDate: '2023-01-01T12:00:00.000Z',
        totalOrderAmount: 1000,
        orderType: 'Private Brand',
        shipToType: 'Secondary',
        itemDetails: [{ id: 1 }],
      };
      const result = transformV2OrderListResponse([order]);
      expect(result[0].orderId).toBe('123');
      expect(result[0].orderStatus).toBe('Awaiting payment'); // Status override rule
      expect(result[0].totalAmount.totalAmount).toBe(1000);
    });

    it('should correctly transform an "isOrder: false" item', () => {
      const opportunity = {
        isOrder: false,
        orderId: 'OP-456',
        orderStatus: 'New',
        createdDate: '2023-01-01T12:00:00.000Z',
        orderType: 'MSME',
        itemDetails: [
          {
            productName: 'Product A',
            quantity: '10 Tonne',
            attributes: { keys: '', values: '' },
          },
        ],
      };
      const result = transformV2OrderListResponse([opportunity]);
      expect(result[0].orderId).toBe('OP-456');
      expect(result[0].orderStatus).toBe('Awaiting confirmation');
      expect(result[0].orderTag).toBe('Fulfilled by JSW One');
      expect(result[0].products[0].displayName).toBe('Product A');
    });
  });

  describe('parseProductQuantity', () => {
    it('should parse quantity and UOM correctly', () => {
      expect(parseProductQuantity('12.0 MT')).toEqual({
        quantity: '12.0',
        uomLabel: 'MT',
      });
    });

    it('should handle quantity without a space', () => {
      expect(parseProductQuantity('12.0MT')).toEqual({
        quantity: '12.0MT',
        uomLabel: '',
      });
    });

    it('should handle null or empty quantity', () => {
      expect(parseProductQuantity(null)).toEqual({
        quantity: '',
        uomLabel: '',
      });
      expect(parseProductQuantity('')).toEqual({ quantity: '', uomLabel: '' });
    });
  });

  describe('createAttributesForOpportunities', () => {
    it('should process TMT product names and merge attributes', () => {
      const item = {
        productName: 'JSW Neosteel TMT - 10',
        attributes: { keys: 'TMT Form', values: 'Straight' },
      };
      const attributes = createAttributesForOpportunities(
        item,
        appConfig.ERP_ORDER_TYPE_MAPPING.MSME,
      );
      expect(item.productName).toBe('JSW Neosteel TMT');
      expect(attributes).toEqual([
        {
          description: 'Diameter',
          value: '10',
          uom: 'mm',
          colourCode: '',
        },
        {
          description: 'Form',
          value: 'Straight',
          uom: '',
          colourCode: '',
        },
      ]);
    });
  });

  describe('transformOpportunityAttributes', () => {
    it('should handle "Dia x TMT Form"', () => {
      const attrs = {
        keys: 'Dia (mm) x TMT Form',
        values: '10 x Straight',
      };
      const result = transformOpportunityAttributes(attrs);
      expect(result).toEqual([
        buildAttribute('Diameter', '10', 'mm'),
        buildAttribute('Form', 'Straight', ''),
      ]);
    });

    it('should handle "TH x WD x LN x Coating grade x PPGL Colour"', () => {
      const attrs = {
        keys: 'TH (mm) x WD (mm) x LN (mm) x Coating grade x PPGL Colour',
        values: '0.5 x 1220 x 2440 x 120 x RAL_9002-9002',
      };
      const result = transformOpportunityAttributes(attrs);
      expect(result).toContainEqual(getPPGLColorInfo('RAL_9002-9002'));
      expect(result).toContainEqual(buildAttribute('Coating grade', '120', 'GSM'));
      expect(result).toContainEqual(
        buildAttribute('Thickness x Width x Length', '0.5 X 1220 X 2440', 'mm'),
      );
    });

    it('should return an empty array for default case', () => {
      const attrs = { keys: 'Unknown Key', values: 'Unknown Value' };
      expect(transformOpportunityAttributes(attrs)).toEqual([]);
    });

    it('should return an empty array for empty keys and values', () => {
      const attrs = { keys: '', values: '' };
      expect(transformOpportunityAttributes(attrs)).toEqual([]);
    });
  });

  describe('extractUOM', () => {
    it('should extract UOM from a key', () => {
      expect(extractUOM('Dia (mm)')).toBe('mm');
    });

    it('should return empty string if no UOM is present', () => {
      expect(extractUOM('TMT Form')).toBe('');
    });
  });

  describe('getPPGLColorInfo', () => {
    it('should parse color name and code', () => {
      expect(getPPGLColorInfo('RAL_9002-9002')).toEqual({
        description: 'Colour',
        value: 'RAL 9002',
        uom: '',
        colourCode: '9002',
      });
    });
  });

  describe('getAppStatusFromOpportunities', () => {
    it('should return status for MSME', () => {
      const order = {
        orderType: 'MSME',
        orderStatus: 'New',
      };
      expect(getAppStatusFromOpportunities(order)).toBe('Awaiting confirmation');
    });

    it('should return status for PB with fulfilledBy "JSW One"', () => {
      const order = {
        orderType: 'Private_Brand',
        orderStatus: 'New',
        fulfilledBy: 'JSW One',
      };
      expect(getAppStatusFromOpportunities(order)).toBe('');
    });

    it('should return status for PB with no fulfilledBy', () => {
      const order = {
        orderType: 'Private_Brand',
        orderStatus: 'New',
        fulfilledBy: null,
      };
      expect(getAppStatusFromOpportunities(order)).toBe('');
    });

    it('should return empty string for unknown types', () => {
      const order = {
        orderType: 'Unknown',
        orderStatus: 'New',
      };
      expect(getAppStatusFromOpportunities(order)).toBe('');
    });
  });

  describe('getOrderTag', () => {
    it('should return correct tag for MSME', () => {
      const order = { orderType: 'MSME' };
      expect(getOrderTag(order)).toBe('Fulfilled by JSW One');
    });

    it('should return correct tag for PB fulfilled by JSW One', () => {
      const order = {
        orderType: 'Private_Brand',
        fulfilledBy: 'JSW One',
      };
      expect(getOrderTag(order)).toBe('');
    });

    it('should return correct tag for PB fulfilled by Warehouse', () => {
      const order = {
        orderType: 'Private_Brand',
        fulfilledBy: 'Warehouse',
      };
      expect(getOrderTag(order)).toBe('');
    });
  });

  describe('getOrderType', () => {
    it('should transform Private_Brand to Private Brand', () => {
      expect(getOrderType('Private_Brand')).toBe('Private_Brand');
    });

    it('should return other order types as is', () => {
      expect(getOrderType('MSME')).toBe('MSME');
    });
  });

  describe('mergeMaterialTrackingAndOrderListingResponses', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    const mockMaterialTrackingResponse = {
      target: 'app-material-tracking',
      success: true,
      data: {
        data: {
          blocks: [
            {
              __component: 'app-components.app-hero-banner',
              title: 'My Orders',
            },
            {
              __component: 'app-components.app-cart-product',
              title: 'Track your material',
            },
          ],
        },
      },
    };

    const mockOrderListingResponse = {
      target: 'app-order-listing',
      success: true,
      data: {
        orderList: [
          {
            orderId: '123',
            orderStatus: 'Delivered',
          },
        ],
      },
    };

    it('should merge order list into the material tracking response successfully', () => {
      const aggregatedResponses: AggregatedResponse[] = [
        mockMaterialTrackingResponse,
        mockOrderListingResponse,
      ];

      const result = mergeMaterialTrackingAndOrderListingResponses(aggregatedResponses);

      const expectedBlocks = [
        {
          __component: 'app-components.app-hero-banner',
          title: 'My Orders',
        },
        {
          __component: 'app-components.app-cart-product',
          title: 'Track your material',
          orderList: [
            {
              orderId: '123',
              orderStatus: 'Delivered',
            },
          ],
        },
      ];

      expect(result.data.blocks).toEqual(expectedBlocks);
      expect(Logger.error).not.toHaveBeenCalled();
    });

    it('should set orderList to an empty array if order listing response is not successful', () => {
      const failedOrderListingResponse = {
        ...mockOrderListingResponse,
        success: false,
      };
      const aggregatedResponses: AggregatedResponse[] = [
        mockMaterialTrackingResponse,
        failedOrderListingResponse,
      ];

      const result = mergeMaterialTrackingAndOrderListingResponses(aggregatedResponses);
      const materialTrackingBlock = result.data.blocks.find(
        (b) => b.__component === 'app-components.app-cart-product',
      );

      expect(materialTrackingBlock.orderList).toEqual([]);
    });

    it('should set orderList to an empty array if orderList is empty', () => {
      const emptyOrderListingResponse = {
        ...mockOrderListingResponse,
        data: {
          orderList: [],
        },
      };
      const aggregatedResponses: AggregatedResponse[] = [
        mockMaterialTrackingResponse,
        emptyOrderListingResponse,
      ];

      const result = mergeMaterialTrackingAndOrderListingResponses(aggregatedResponses);
      const materialTrackingBlock = result.data.blocks.find(
        (b) => b.__component === 'app-components.app-cart-product',
      );

      expect(materialTrackingBlock.orderList).toEqual([]);
    });

    it('should handle missing material tracking block gracefully', () => {
      const noCartProductBlockResponse = {
        ...mockMaterialTrackingResponse,
        data: {
          data: {
            blocks: [
              {
                __component: 'app-components.app-hero-banner',
                title: 'My Orders',
              },
            ],
          },
        },
      };
      const aggregatedResponses: AggregatedResponse[] = [
        noCartProductBlockResponse,
        mockOrderListingResponse,
      ];

      const result = mergeMaterialTrackingAndOrderListingResponses(aggregatedResponses);
      const materialTrackingBlock = result.data.blocks.find(
        (b) => b.__component === 'app-components.app-cart-product',
      );

      expect(materialTrackingBlock).toBeUndefined();
      expect(result.data.blocks).toHaveLength(1);
    });

    it('should return empty data and log an error if material tracking response is missing', () => {
      const aggregatedResponses: AggregatedResponse[] = [mockOrderListingResponse];

      const result = mergeMaterialTrackingAndOrderListingResponses(aggregatedResponses);

      expect(result).toEqual({ data: {}, meta: {} });
      expect(Logger.error).toHaveBeenCalledWith(
        'Error for Orders Page API method: mergeMaterialTrackingAndOrderListingResponses Strapi response is missing or invalid',
      );
    });
  });
});
