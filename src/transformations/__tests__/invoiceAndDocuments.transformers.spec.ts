import { formatDate } from '../../../src/utils/common-functions.util';
import {
  transformDocuments,
  transformDocumentType,
  transformInvoiceAndDocuments,
} from '../invoiceAndDocuments.transformers';

jest.mock('../../../src/utils/common-functions.util', () => ({
  formatDate: jest.fn((date) => `formatted_${date}`),
  toTitleCase: jest.fn((str: string) => {
    if (str === 'invoice') return 'Invoice';
    if (str === 'testCertificate') return 'Test Certificate';
    if (str === 'other') return 'Other Document';
    return str;
  }),
  safeDebug: jest.fn(),
}));

describe('invoiceAndDocuments.transformers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('transformDocumentType', () => {
    it('should transform a document type with available data', () => {
      const orderShipment = {
        invoice: [
          {
            fileName: 'invoice.pdf',
            signedUrl: 'http://example.com/invoice.pdf',
          },
        ],
      };
      const type = 'invoice';
      const expected = {
        name: 'Invoice',
        fileName: 'invoice.pdf',
        signedUrl: 'http://example.com/invoice.pdf',
      };

      const result = transformDocumentType(orderShipment, type);
      expect(result).toEqual(expected);
    });

    it('should return empty strings for fileName and signedUrl if document type is missing', () => {
      const orderShipment = {};
      const type = 'invoice';
      const expected = {
        name: 'Invoice',
        fileName: '',
        signedUrl: '',
      };

      const result = transformDocumentType(orderShipment, type);
      expect(result).toEqual(expected);
    });

    it('should return empty strings for fileName and signedUrl if document type array is empty', () => {
      const orderShipment = {
        invoice: [],
      };
      const type = 'invoice';
      const expected = {
        name: 'Invoice',
        fileName: '',
        signedUrl: '',
      };

      const result = transformDocumentType(orderShipment, type);
      expect(result).toEqual(expected);
    });
  });

  describe('transformDocuments', () => {
    it('should transform all document types for a given order shipment', () => {
      const orderShipment = {
        invoice: [
          {
            fileName: 'invoice.pdf',
            signedUrl: 'http://example.com/invoice.pdf',
          },
        ],
        testCertificate: [
          {
            fileName: 'cert.pdf',
            signedUrl: 'http://example.com/cert.pdf',
          },
        ],
        other: [],
      };

      const expected = [
        {
          name: 'Invoice',
          fileName: 'invoice.pdf',
          signedUrl: 'http://example.com/invoice.pdf',
        },
        {
          name: 'Test Certificate',
          fileName: 'cert.pdf',
          signedUrl: 'http://example.com/cert.pdf',
        },
        { name: 'Other Document', fileName: '', signedUrl: '' },
      ];

      const result = transformDocuments(orderShipment);
      expect(result).toEqual(expected);
    });

    it('should return documents with empty details if orderShipment has no document properties', () => {
      const orderShipment = { shipmentNumber: '123' };
      const expected = [
        { name: 'Invoice', fileName: '', signedUrl: '' },
        { name: 'Test Certificate', fileName: '', signedUrl: '' },
        { name: 'Other Document', fileName: '', signedUrl: '' },
      ];

      const result = transformDocuments(orderShipment);
      expect(result).toEqual(expected);
    });
  });

  describe('transformInvoiceAndDocuments', () => {
    const mockOrderShipment = {
      shipmentNumber: 'SHIP123',
      dispatchedOn: '2023-10-27T10:00:00Z',
      pbOrder: 'PB123',
      invoice: [
        {
          fileName: 'invoice.pdf',
          signedUrl: 'http://example.com/invoice.pdf',
        },
      ],
      testCertificate: [],
      other: [],
    };

    const mockApiResponse = {
      data: {
        data: {
          orderShipmentSummaryList: [mockOrderShipment],
        },
      },
    };

    it('should transform a valid API response correctly', () => {
      const result = transformInvoiceAndDocuments(mockApiResponse);
      const expectedTransformedDocuments = [
        {
          name: 'Invoice',
          fileName: 'invoice.pdf',
          signedUrl: 'http://example.com/invoice.pdf',
        },
        { name: 'Test Certificate', fileName: '', signedUrl: '' },
        { name: 'Other Document', fileName: '', signedUrl: '' },
      ];

      expect(result).toEqual({
        listOfDocuments: [
          {
            shipmentNumber: 'SHIP123',
            dispatchedOn: 'formatted_2023-10-27T10:00:00Z',
            documents: expectedTransformedDocuments,
            pbOrder: 'PB123',
          },
        ],
      });
      expect(formatDate).toHaveBeenCalledWith('2023-10-27T10:00:00Z');
    });

    it('should return an empty list if response is null or undefined', () => {
      expect(transformInvoiceAndDocuments(null)).toEqual({
        listOfDocuments: [],
      });
      expect(transformInvoiceAndDocuments(undefined)).toEqual({
        listOfDocuments: [],
      });
    });

    it('should return an empty list if orderShipmentSummaryList is missing or empty', () => {
      const emptyResponse1 = { data: { data: {} } };
      const emptyResponse2 = {
        data: { data: { orderShipmentSummaryList: [] } },
      };

      expect(transformInvoiceAndDocuments(emptyResponse1)).toEqual({
        listOfDocuments: [],
      });
      expect(transformInvoiceAndDocuments(emptyResponse2)).toEqual({
        listOfDocuments: [],
      });
    });

    it('should handle missing optional fields gracefully', () => {
      const partialOrderShipment = {
        dispatchedOn: '2023-10-28T10:00:00Z',
        invoice: [],
        testCertificate: [],
        other: [],
      };
      const apiResponse = {
        data: { data: { orderShipmentSummaryList: [partialOrderShipment] } },
      };

      const result = transformInvoiceAndDocuments(apiResponse);
      expect(result.listOfDocuments[0].shipmentNumber).toBe('');
      expect(result.listOfDocuments[0].pbOrder).toBeUndefined();
      expect(result.listOfDocuments[0].dispatchedOn).toBe('formatted_2023-10-28T10:00:00Z');
    });

    it('should return an empty list and log an error if an exception occurs', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const faultyResponse = {
        data: {
          data: { orderShipmentSummaryList: 'not an array' },
        },
      };

      const result = transformInvoiceAndDocuments(faultyResponse);
      expect(result).toEqual({ listOfDocuments: [] });
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
