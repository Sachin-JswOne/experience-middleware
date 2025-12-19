import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';
import { Logger } from '@nestjs/common';
import {
  selectOrderDetailTarget,
  transformOpportunityDetails,
  transformOpportunityDetailsRequest,
  transformOpportunityDetailsResponse,
  transformOrderDetails,
  transformOrderDetailsRequest,
  transformOrderDetailsResponse,
} from '../orderDetails.transformers';
import * as orderListingTransformers from '../orderListing.transformers';

jest.mock('src/utils/CustomError');
jest.mock('@nestjs/common', () => ({
  Logger: {
    error: jest.fn(),
  },
}));

describe('orderDetails.transformers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('selectOrderDetailTarget', () => {
    it("should return 'order-detail' when isOrder is 'true'", () => {
      const request = { query: { isOrder: 'true' } };
      expect(selectOrderDetailTarget(request)).toBe('order-detail');
    });

    it("should return 'opportunity-detail' when isOrder is 'false'", () => {
      const request = { query: { isOrder: 'false' } };
      expect(selectOrderDetailTarget(request)).toBe('opportunity-detail');
    });

    it("should return 'opportunity-detail' when isOrder is not present", () => {
      const request = { query: {} };
      expect(selectOrderDetailTarget(request)).toBe('opportunity-detail');
    });
  });

  describe('transformOrderDetailsRequest', () => {
    it('should transform the request correctly', () => {
      const request: BaseRequest = {
        url: new URL('http://localhost/api'),
        params: { id: 'JOO-12345' },
        body: { some: 'body' },
        headers: {},
      };
      const transformed = transformOrderDetailsRequest(request);
      expect(transformed.body).toBeNull();
      expect(transformed.url.search).toBe('?orderNumber=JOO-12345');
    });
  });

  describe('transformOrderDetailsResponse', () => {
    const mockResponse = {
      success: true,
      responseCode: '200',
      data: {
        data: {
          createdDate: '2025-06-20T11:37:01',
          orderNumber: 'JOO-3F297RPBC',
          shippingAddress: {
            id: null,
            streetLine1: 'Grande Palladium,',
            city: 'Varanasi East',
            region: 'a03Bh00000DjpLSIAZ',
            state: 'UTTAR PRADESH',
            name: null,
            postalCode: 221104,
            mobileNumber: '5432345675',
            companyName: 'ACCENTURE SOLUTIONS PRIVATE LIMITED',
          },
          billingAddress: {
            id: null,
            streetLine1:
              'GROUD FLOOR, 464 SHIVANI MARG, SHOP NO 17A PACIFIC MALL, NAJAFGARH ROAD, KHAYALA',
            city: 'New Delhi West',
            region: 'WEST',
            state: 'DELHI',
            name: null,
            postalCode: 110018,
            mobileNumber: '8329226479',
            companyName: 'ARVIND LIMITED',
          },
          orderStatus: 'Placed',
          totalPrice: '3,75,200.00',
          totalTaxes: '67,536.00',
          totalOrderAmount: '4,42,736.00',
          itemDetails: [
            {
              brandName: 'JSW One',
              productName: 'Test JSW One Fe550 TMT Rebar',
              diameter: '10 mm',
              quantity: '7 MT',
              form: '',
              sellerName: 'JSW One Distribution Limited',
              taxPercentage: 0.18,
              price: 53600.0,
              totalPrice: 375200.0,
              attributes: { Form: 'Straight', Diameter: '10 mm' },
              imageUrl: 'some-url/image.png',
              grade: 'Fe550',
            },
          ],
          paymentStatus: 'Pending',
          pbOrder: true,
          totalPaymentReceived: 0.0,
          totalPaymentPending: 442736.0,
        },
      },
    };

    it('should transform the successful response correctly', () => {
      const result = transformOrderDetailsResponse(mockResponse);
      expect(result).toHaveProperty('orderDetails');
      const { orderDetails } = result;
      expect(orderDetails?.orderId).toBe('JOO-3F297RPBC');
      expect(orderDetails?.orderStatus).toBe('Order created');
      expect(orderDetails?.orderPlacedDate).toBe('June 20, 2025');
      expect(orderDetails?.priceTotal.totalAmount).toBe(442736.0);
      expect(orderDetails?.products.length).toBe(1);
      expect(orderDetails?.products[0].brand).toBe('JSW One');
      expect(orderDetails?.billingAddress.postalCode).toBe('110018');
    });

    it('should handle Placed orderStatus', () => {
      const response = JSON.parse(JSON.stringify(mockResponse));
      response.data.data.orderStatus = 'Placed';
      const result = transformOrderDetails(response.data.data);
      expect(result?.orderStatus).toBe('Order created');
    });

    it('should handle Created orderStatus', () => {
      const response = JSON.parse(JSON.stringify(mockResponse));
      response.data.data.orderStatus = 'Created';
      const result = transformOrderDetails(response.data.data);
      expect(result?.orderStatus).toBe('Order created');
    });

    it('should throw CustomError if response data is missing', () => {
      const errorResponse = {
        data: null,
        errors: 'Some error',
        responseCode: '500',
      };
      expect(() => transformOrderDetailsResponse(errorResponse)).toThrow(CustomError);
      expect(Logger.error).toHaveBeenCalled();
    });

    it('should throw CustomError if response has errors', () => {
      const errorResponse = {
        errors: { message: 'Internal Server Error' },
        responseCode: '500',
      };
      expect(() => transformOrderDetailsResponse(errorResponse)).toThrow(CustomError);
      expect(CustomError).toHaveBeenCalledWith(errorResponse.errors, errorResponse.responseCode);
    });
  });

  describe('transformOpportunityDetailsRequest', () => {
    it('should transform the request for opportunity details', () => {
      const url = new URL('http://localhost/api?customerType=Sites');
      const request = {
        url: url,
        params: { id: 'OPP-123' },
      };
      jest.spyOn(orderListingTransformers, 'getDeveloperName').mockReturnValue('MSME');

      const transformed = transformOpportunityDetailsRequest(request);

      expect(transformed.url.searchParams.get('developerName')).toBe('MSME');
      expect(transformed.url.searchParams.get('opportunityId')).toBe('OPP-123');
      expect(transformed.url.searchParams.has('customerType')).toBe(false);
    });
  });

  describe('transformOpportunityDetailsResponse', () => {
    const mockOpportunityResponse = {
      data: {
        data: {
          createdDate: '2025-06-20T11:37:01',
          orderType: 'Private Brand',
          billingAddress: { id: 'b1' },
          shippingAddress: { id: 's1' },
          itemDetails: [{ brandName: 'JSW', sellerName: 'JSW Seller' }],
        },
      },
    };

    it('should transform a successful opportunity response', () => {
      jest
        .spyOn(orderListingTransformers, 'getAppStatusFromOpportunities')
        .mockReturnValue('Follow Up');
      jest.spyOn(orderListingTransformers, 'getOrderTag').mockReturnValue('Lead');
      jest.spyOn(orderListingTransformers, 'transformSingleOpportunityProduct').mockReturnValue({
        displayName: 'TMT',
        uomLabel: '',
        quantity: '',
        attributes: [],
      });

      const result = transformOpportunityDetailsResponse(mockOpportunityResponse);
      const { orderDetails } = result;

      expect(orderDetails.orderStatus).toBe('Follow Up');
      expect(orderDetails.orderTag).toBe('Lead');
      expect(orderDetails.pbOrder).toBe(true);
      expect(orderDetails.products.length).toBe(1);
      expect(orderDetails.products[0].brand).toBe('JSW');
    });

    it('should throw CustomError if opportunity response data is missing', () => {
      const errorResponse = {
        data: null,
        errors: 'Some error',
        responseCode: '500',
      };
      expect(() => transformOpportunityDetailsResponse(errorResponse)).toThrow(CustomError);
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('transformOpportunityDetails', () => {
    it('should return default values when parts of data are missing', () => {
      const data = {
        createdDate: '2025-06-20T11:37:01',
        orderType: 'Standard',
        itemDetails: [{}],
      };
      jest.spyOn(orderListingTransformers, 'getAppStatusFromOpportunities').mockReturnValue('New');
      jest.spyOn(orderListingTransformers, 'getOrderTag').mockReturnValue('Lead');
      jest.spyOn(orderListingTransformers, 'transformSingleOpportunityProduct').mockReturnValue({
        displayName: undefined,
        uomLabel: '',
        quantity: '',
        attributes: [],
      });

      const result = transformOpportunityDetails(data);
      expect(result.pbOrder).toBe(false);
      expect(result.priceTotal.totalAmount).toBe(0);
      expect(result.shippingAddress.id).toBe('');
      expect(result.billingAddress.id).toBe('');
      expect(result.products[0].itemPrice.price).toBe(0);
    });
  });
});
