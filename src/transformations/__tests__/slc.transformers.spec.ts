import { convertSlcResponse } from '../slc.transformers';
import { slcMockData } from './__mocks__/slcMockData';

describe('convertSlcResponse', () => {
  it('should return the slcCart object for SALES_LEAD_CART journeyType', () => {
    const mockResponse = slcMockData;
    const result = convertSlcResponse(mockResponse);
    expect(result).toEqual({ numberOfItems: 1, totalPrice: '5,911.80' });
  });

  it('should return an empty object if data is missing', () => {
    const mockResponse = {};
    const result = convertSlcResponse(mockResponse);
    expect(result).toEqual({});
  });

  it('should return the input if response is not an object', () => {
    const mockResponse = null;
    const result = convertSlcResponse(mockResponse);
    expect(result).toBeNull();
  });

  it('should handle errors gracefully and return empty object', () => {
    // Force an error by passing an object with data but missing identifier
    const mockResponse = { data: {} };
    const result = convertSlcResponse(mockResponse);
    expect(result).toEqual({});
  });
});
