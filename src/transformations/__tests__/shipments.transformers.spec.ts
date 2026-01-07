/* eslint-disable @typescript-eslint/no-unused-vars */

import * as invoiceAndDocumentsTransformers from '../invoiceAndDocuments.transformers';
import * as appConfig from 'src/config/app.config';
import * as utils from 'src/utils/common-functions.util';
import {
  createAttributes,
  getProductsFromItemDetails,
  mergeInvoiceAndShipmentsResponse,
  parseQuantity,
  transformAttributes,
  transformShipmentDetails,
  transformSingleProduct,
} from '../shipments.transformers';

jest.mock('../invoiceAndDocuments.transformers');
jest.mock('src/utils/common-functions.util');

describe('mergeInvoiceAndShipmentsResponse', () => {
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    (console.error as jest.Mock).mockRestore();
  });
  const mockFormatDate = utils.formatDate as jest.Mock;
  const mockGetListOfDocuments = invoiceAndDocumentsTransformers.getListOfDocuments as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFormatDate.mockImplementation((date) => `formatted:${date}`);
    mockGetListOfDocuments.mockImplementation((data) => [
      {
        shipmentNumber: 'JOD-T64UGL2LXW',
        invoice: [{ fileName: 'JODLTN07253869.pdf', signedUrl: 'url' }],
      },
    ]);
  });

  const aggregatedResponses = [
    {
      target: 'app-shipment',
      success: true,
      data: {
        success: true,
        responseCode: '200',
        requestId: '0CLGISUS4YFRI3IU',
        errors: null,
        data: {
          orderShipmentDetailsSRO: {
            orderShipmentDetailsList: [
              {
                shipmentNumber: 'JOD-T64UGL2LXW',
                totalInvoicedAmount: 1416.0,
                dispatchedOn: '2025-09-03T00:00:00',
                deliveredOn: null,
                lineItemCount: 74,
                shipmentState: 'Dispatched',
                invoiceAmount: 1416.0,
                cashAdvanceUtilised: null,
                creditUtilised: null,
                deliveryType: 'SELLER_DELIVERY',
                address: {
                  id: null,
                  streetLine1: '4-B, MALHAR ROAD, LUDHIANA',
                  city: 'LUDHIANA (EAST)',
                  region: 'LUDHIANA',
                  state: 'PUNJAB',
                  name: null,
                  postalCode: 141001,
                  mobileNumber: null,
                  companyName: null,
                },
                sellerPhoneNumber: null,
                itemDetails: [
                  {
                    brandName: 'JSW Steel',
                    productName: 'JSW Steel Hot Rolled Sheets IS 2062:2011 E250A',
                    diameter: null,
                    quantity: '1.00 MT',
                    form: 'HRCTLF',
                    sellerName: 'JSW One Distribution Limited',
                    taxPercentage: 0.18,
                    price: 1200.0,
                    totalPrice: 12000.0,
                    attributes: {
                      Length: '100 mm',
                      Thickness: '2 mm',
                      'Width (mm)': '1250 mm',
                    },
                  },
                ],
                driverNumber: null,
                truckNumber: null,
                trackingUrl: 'http://klr.bz/FRTTGR/zbWfZ',
                pbOrder: false,
              },
            ],
            totalShipment: 1,
            inTransitShipment: 1,
            paymentTypeEnum: null,
            creditType: null,
            creditInstrument: null,
          },
        },
      },
    },
    {
      target: 'app-invoice-and-documents',
      success: true,
      data: {
        success: true,
        responseCode: '200',
        requestId: 'LTSD2CLR102QNWNB',
        errors: null,
        data: {
          data: {
            orderShipmentSummaryList: [
              {
                shipmentNumber: 'JOD-T64UGL2LXW',
                dispatchedOn: '2025-09-03',
                invoice: [
                  {
                    signedUrl: 'url',
                    fileName: 'JODLTN07253869.pdf',
                  },
                ],
                testCertificate: [],
                weightmentSlips: [],
                lorryReceipt: [],
                other: [],
                shipmentMisc: [],
                pbOrder: false,
              },
            ],
          },
        },
      },
    },
  ];

  it('should merge shipments and documents correctly', () => {
    const result = mergeInvoiceAndShipmentsResponse(aggregatedResponses as any);
    expect(result.listOfShipments).toHaveLength(1);
    const shipment = result.listOfShipments[0];
    expect(shipment.shipmentId).toBe('JOD-T64UGL2LXW');
    expect(shipment.downloadInvoiceAndDocumentDetails[0].shipmentNumber).toBe('JOD-T64UGL2LXW');
    expect(shipment.shipmentStatus).toBe(appConfig.SHIPMENT_STATUS['Dispatched']);
    expect(shipment.shippedOn).toBe('formatted:2025-09-03T00:00:00');
    expect(shipment.priceTotal.currencyCode).toBe(appConfig.DEFAULT_CURRENCY_CODE);
    expect(shipment.products[0].brand).toBe('JSW Steel');
    expect(shipment.products[0].sellerName).toBe('JSW One Distribution Limited');
    expect(mockGetListOfDocuments).toHaveBeenCalled();
    expect(mockFormatDate).toHaveBeenCalled();
  });

  it('should throw error if no shipment found (missing data)', () => {
    const responses = [
      { target: 'app-shipment', data: null },
      { target: 'app-invoice-and-documents', data: {} },
    ];
    expect(() => mergeInvoiceAndShipmentsResponse(responses as any)).toThrow('No shipment found');
  });

  it('should throw error if orderShipmentDetailsList is missing', () => {
    const responses = [
      {
        target: 'app-shipment',
        data: { data: { orderShipmentDetailsSRO: {} } },
      },
      { target: 'app-invoice-and-documents', data: {} },
    ];
    expect(() => mergeInvoiceAndShipmentsResponse(responses as any)).toThrow('No shipment found');
  });

  it('should handle missing documents gracefully', () => {
    mockGetListOfDocuments.mockReturnValueOnce([]);
    const result = mergeInvoiceAndShipmentsResponse(aggregatedResponses as any);
    expect(result.listOfShipments[0].downloadInvoiceAndDocumentDetails).toEqual([]);
  });

  it('should filter out shipments with unknown status', () => {
    const responses = [
      {
        target: 'app-shipment',
        data: {
          data: {
            orderShipmentDetailsSRO: {
              orderShipmentDetailsList: [
                {
                  shipmentNumber: 'X',
                  shipmentState: 'Unknown',
                  itemDetails: [],
                },
              ],
            },
          },
        },
      },
      { target: 'app-invoice-and-documents', data: { data: { data: {} } } },
    ];
    mockGetListOfDocuments.mockReturnValue([]);
    const result = mergeInvoiceAndShipmentsResponse(responses as any);
    expect(result.listOfShipments).toEqual([]);
  });

  it('should handle empty aggregatedResponses', () => {
    expect(() => mergeInvoiceAndShipmentsResponse([] as any)).toThrow('No shipment found');
  });
});

describe('transformShipmentDetails', () => {
  it('should transform shipment details with known status', () => {
    const orderShipmentDetailsSRO = [
      {
        shipmentNumber: 'S1',
        shipmentState: 'Dispatched',
        dispatchedOn: '2025-09-03T00:00:00',
        deliveredOn: null,
        totalInvoicedAmount: 100,
        driverNumber: 'D1',
        truckNumber: 'T1',
        itemDetails: [
          {
            brandName: 'B',
            productName: 'P',
            quantity: '1.00 MT',
            attributes: {},
          },
        ],
        pbOrder: false,
        trackingUrl: 'url',
      },
    ];
    const listOfDocuments = [{ shipmentNumber: 'S1' }];
    jest.spyOn(utils, 'formatDate').mockReturnValue('formatted-date');
    const result = transformShipmentDetails(orderShipmentDetailsSRO, listOfDocuments);
    expect(result).toHaveLength(1);
    expect(result[0].shipmentId).toBe('S1');
    expect(result[0].shipmentStatus).toBe(appConfig.SHIPMENT_STATUS['Dispatched']);
    expect(result[0].shippedOn).toBe('formatted-date');
    expect(result[0].downloadInvoiceAndDocumentDetails[0].shipmentNumber).toBe('S1');
  });

  it('should filter out shipments with unknown status', () => {
    const orderShipmentDetailsSRO = [
      { shipmentNumber: 'S2', shipmentState: 'Unknown', itemDetails: [] },
    ];
    const result = transformShipmentDetails(orderShipmentDetailsSRO, []);
    expect(result).toEqual([]);
  });
});

describe('getProductsFromItemDetails', () => {
  it('should map itemDetails to products with brand and sellerName', () => {
    const itemDetails = [
      {
        brandName: 'BrandX',
        sellerName: 'SellerY',
        productName: 'ProdZ',
        quantity: '2.00 KG',
        attributes: {},
      },
    ];
    const result = getProductsFromItemDetails(itemDetails);
    expect(result[0].brand).toBe('BrandX');
    expect(result[0].sellerName).toBe('SellerY');
    expect(result[0].displayName).toBe('ProdZ');
    expect(result[0].quantity).toBe('2.00');
    expect(result[0].uomLabel).toBe('KG');
  });
});

describe('transformSingleProduct', () => {
  it('should transform a single product item', () => {
    const item = {
      productName: 'ProdA',
      quantity: '5.00 MT',
      attributes: { Length: '100 mm' },
    };
    const result = transformSingleProduct(item);
    expect(result.displayName).toBe('ProdA');
    expect(result.quantity).toBe('5.00');
    expect(result.uomLabel).toBe('MT');
    expect(Array.isArray(result.attributes)).toBe(true);
  });
});

describe('parseQuantity', () => {
  it('should parse quantity and uomLabel from string', () => {
    expect(parseQuantity('10.5 MT')).toEqual({
      quantity: '10.5',
      uomLabel: 'MT',
    });
  });
  it('should return empty strings if quantity is null', () => {
    expect(parseQuantity(null)).toEqual({ quantity: '', uomLabel: '' });
  });
});

describe('createAttributes', () => {
  it('should call transformAttributes and return its result', () => {
    const item = { attributes: { Length: '100 mm' } };
    const result = createAttributes(item);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].description).toBe('Length');
    expect(result[0].value).toBe('100');
    expect(result[0].uom).toBe('mm');
  });
});

describe('transformAttributes', () => {
  it('should transform attributes object to array with dimensions', () => {
    const attributesObj = {
      Length: '100 mm',
      Thickness: '2 mm',
      'Width (mm)': '1250 mm',
      Colour: 'Red-#FF0000',
      Grade: 'A',
    };
    const result = transformAttributes(attributesObj);
    expect(result.some((a) => a.description === 'Colour')).toBe(true);
    expect(result.some((a) => a.description === 'Grade')).toBe(true);
    expect(
      result.some((a) => a.description.includes('Thickness x Width x Length')) ||
        result.some((a) => a.description.includes('Thickness x Length x Width')),
    ).toBe(true);
    const colour = result.find((a) => a.description === 'Colour');
    expect(colour.value).toBe('Red');
    expect(colour.colourCode).toBe('#FF0000');
  });

  it('should handle empty attributes object', () => {
    expect(transformAttributes({})).toEqual([]);
  });
});
