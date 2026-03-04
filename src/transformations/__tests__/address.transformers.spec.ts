/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { country } from 'src/config/app.config';
import {
  transformcreateAddressRequest,
  transformcreateAddressResponse,
  transformGetAddressResponse,
} from '../address.transformers';

describe('transformcreateAddressRequest', () => {
  it('should transform request with all fields provided', () => {
    const mockRequest: any = {
      headers: { authorization: 'token' },
      body: {
        company: 'ABC Pvt Ltd',
        firstName: 'John',
        lastName: 'Doe',
        postalCode: '560001',
        city: 'Bangalore',
        state: 'Karnataka',
        email: 'john@test.com',
        mobile: '9999999999',
        streetLine1: 'Street 1',
        streetLine2: 'Street 2',
        region: 'South',
      },
    };

    const result = transformcreateAddressRequest(mockRequest);

    expect(result.body).toEqual({
      company: 'ABC Pvt Ltd',
      firstName: 'John',
      lastName: 'Doe',
      postalCode: '560001',
      city: 'Bangalore',
      state: 'Karnataka',
      country: country,
      email: 'john@test.com',
      mobile: '9999999999',
      streetLine1: 'Street 1',
      streetLine2: 'Street 2',
      isPrimaryAddress: false,
      region: 'South',
    });

    expect(result.headers).toEqual(mockRequest.headers);
  });

  it('should apply default values when optional fields are missing', () => {
    const mockRequest: any = {
      body: {
        company: 'ABC Pvt Ltd',
        postalCode: '560001',
        city: 'Bangalore',
        state: 'Karnataka',
        streetLine1: 'Street 1',
        region: 'South',
      },
    };

    const result = transformcreateAddressRequest(mockRequest);

    expect(result.body.firstName).toBe('');
    expect(result.body.lastName).toBe('');
    expect(result.body.email).toBe('');
    expect(result.body.mobile).toBeNull();
    expect(result.body.streetLine2).toBe('');
  });
});

describe('transformcreateAddressResponse', () => {
  it('should return success true when addresses exist', () => {
    const mockResponse = {
      addresses: [{ id: '1' }],
    };

    const result = transformcreateAddressResponse(mockResponse);

    expect(result).toEqual({ success: true });
  });

  it('should throw error when addresses array is empty', () => {
    const mockResponse = {
      addresses: [],
    };

    expect(() => transformcreateAddressResponse(mockResponse)).toThrow('Address Creation failed');
  });

  it('should throw error when response is null', () => {
    expect(() => transformcreateAddressResponse(null)).toThrow('Address Creation failed');
  });

  it('should throw error when addresses property is missing', () => {
    const mockResponse = {};

    expect(() => transformcreateAddressResponse(mockResponse)).toThrow('Address Creation failed');
  });
});

describe('transformGetAddressResponse', () => {
  it('should transform address list correctly', () => {
    const mockResponse = {
      defaultShippingAddressId: '1',
      defaultBillingAddressId: '2',
      addresses: [
        {
          id: '1',
          state: 'Karnataka',
          postalCode: '560001',
          region: 'South',
          company: 'ABC Pvt Ltd',
          city: 'Bangalore',
          mobile: '9999999999',
          custom: {
            fields: {
              streetLine1: 'Street 1',
            },
          },
        },
        {
          id: '2',
          state: 'Tamil Nadu',
          postalCode: '600001',
          region: 'South',
          company: 'XYZ Pvt Ltd',
          city: 'Chennai',
          mobile: '8888888888',
          custom: {
            fields: {
              streetLine1: 'Street 2',
            },
          },
        },
      ],
    };

    const result = transformGetAddressResponse(mockResponse);

    expect(result.AddressList).toHaveLength(2);

    expect(result.AddressList[0]).toEqual({
      state: 'Karnataka',
      shiptoAddressTag: 'Site',
      pincode: '560001',
      isShippingAddress: true,
      isBillingAddress: false,
      district: 'South',
      companyName: 'ABC Pvt Ltd',
      city: 'Bangalore',
      underApproval: true,
      addressLine1: 'Street 1',
      contactNumber: '9999999999',
    });

    expect(result.AddressList[1].shiptoAddressTag).toBe('Shop');
    expect(result.AddressList[1].isBillingAddress).toBe(true);
    expect(result.AddressList[1].isShippingAddress).toBe(false);
  });

  it('should handle missing custom fields safely', () => {
    const mockResponse = {
      defaultShippingAddressId: '1',
      defaultBillingAddressId: '1',
      addresses: [
        {
          id: '1',
          state: 'Karnataka',
          postalCode: '560001',
          region: 'South',
          company: 'ABC Pvt Ltd',
          city: 'Bangalore',
          mobile: '9999999999',
          custom: {},
        },
      ],
    };

    const result = transformGetAddressResponse(mockResponse);

    expect(result.AddressList[0].addressLine1).toBeUndefined();
  });
});
