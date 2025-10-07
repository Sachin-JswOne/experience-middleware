import { CustomError } from 'src/utils/CustomError';
import {
  verifyGstin,
  verifyGstinResponse,
  convertToAddress,
} from '../verifyGstin.transformers';

describe('verifyGstin transformer', () => {
  describe('verifyGstin', () => {
    it('should transform request with gstin in body', () => {
      const mockRequest: any = {
        url: new URL('https://example.com'),
        headers: {},
        body: { gstin: '29ABCDE1234F1Z5' },
      };

      const result = verifyGstin(mockRequest);

      expect(result.body).toEqual({ gstin: '29ABCDE1234F1Z5' });
    });
  });

  describe('verifyGstinResponse', () => {
    it('should return final result with address when no error', () => {
      const mockResponse = {
        data: {
            companyName: 'ABC Ltd',
            streetLine1: '123 Street',
            streetLine2: 'Suite 456',
            region: 'South',
            city: 'Bangalore',
            state: 'Karnataka',
            pinCode: '560001',
            country: 'India',
        },
      };

      const result = verifyGstinResponse(mockResponse);

      expect(result.gstVerified).toBe(true);
      expect(result.userAlreadyExists).toBe(false);
      expect(result.gstDetails).toContain('ABC Ltd');
      expect(result.gstDetails).toContain('Bangalore');
    });

    it('should return user already exists when error message includes "Account already registered"', () => {
      const mockResponse = {
        error: { message: 'Account already registered with this GSTIN' },
      };

      const result = verifyGstinResponse(mockResponse);

      expect(result.gstVerified).toBe(true);
      expect(result.userAlreadyExists).toBe(true);
      expect(result.gstDetails).toBe('');
    });

    it('should throw BadRequestException when error message includes "Please enter valid"', () => {
      const mockResponse = {
        error: { message: 'Please enter valid GSTIN for account registration on JSW ONE MSME' },
      };

      expect(() => verifyGstinResponse(mockResponse)).toThrow(CustomError);
    });
  });

  describe('convertToAddress', () => {
    it('should concatenate all address fields into a single string', () => {
      const resData = {
        companyName: 'XYZ Pvt Ltd',
        streetLine1: '456 Main Road',
        streetLine2: '',
        region: 'West',
        city: 'Mumbai',
        state: 'Maharashtra',
        pinCode: '400001',
        country: 'India',
      };

      const address = convertToAddress(resData);

      expect(address).toContain('XYZ Pvt Ltd');
      expect(address).toContain('Mumbai');
      expect(address).toContain('400001');
    });
  });
});
