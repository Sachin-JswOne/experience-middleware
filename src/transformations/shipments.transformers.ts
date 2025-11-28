/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { getListOfDocuments } from './invoiceAndDocuments.transformers';
import {
  DEFAULT_CURRENCY_CODE,
  ORDER_TAG,
  SHIPMENT_STATUS,
} from 'src/config/app.config';
import { formatDate } from 'src/utils/common-functions.util';
import { CustomError } from 'src/utils/CustomError';
import { HttpStatus } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';

export function mergeInvoiceAndShipmentsResponse(
  aggregatedResponses: AggregatedResponse[],
) {
  try {
    const responses = aggregatedResponses.reduce(
      (acc, response) => {
        acc[response.target] = response;
        return acc;
      },
      {} as Record<string, AggregatedResponse>,
    );

    const shipmentsResponse = responses['app-shipment'];
    const invoiceAndDocumentsResponse = responses['app-invoice-and-documents'];

    safeDebug(Logger, () => ` Shipments Api response from method: mergeInvoiceAndShipmentResponse : ${JSON.stringify(
      shipmentsResponse,
    )}`);

    safeDebug(Logger, () => `Invoice and Documents Api response from method: mergeInvoiceAndShipmentResponse : ${JSON.stringify(
      invoiceAndDocumentsResponse,
    )}`);
    const data = shipmentsResponse?.data;

    const orderShipmentDetailsSRO =
      data?.data?.orderShipmentDetailsSRO?.orderShipmentDetailsList;

    if (!data || !orderShipmentDetailsSRO) {
      throw new CustomError('No shipment found', HttpStatus.NOT_FOUND);
    }

    const invoiceDocumentsResponse =
      invoiceAndDocumentsResponse?.data?.data?.data;

    let listOfDocuments: any[] = [];

    if (invoiceDocumentsResponse) {
      listOfDocuments = getListOfDocuments(invoiceDocumentsResponse);
    }

    const shipments = transformShipmentDetails(
      orderShipmentDetailsSRO,
      listOfDocuments,
    );
    return { listOfShipments: shipments };
  } catch (error) {
    Logger.log(
      `Transforming Shipment Request  method: mergeInvoiceAndShipmentResponse`,
    );
    console.error('Error in mergeInvoiceAndShipmentsResponse:', error);
    throw error;
  }
}

export function transformShipmentDetails(
  orderShipmentDetailsSRO,
  listOfDocuments,
) {
  return orderShipmentDetailsSRO
    .map((val) => {
      if (SHIPMENT_STATUS[val.shipmentState]) {
        const documents = listOfDocuments.find(
          (obj) => obj.shipmentNumber === val.shipmentNumber,
        );
        const downloadInvoiceAndDocumentDetails: any = [];
        if (documents?.shipmentNumber) {
          downloadInvoiceAndDocumentDetails.push(documents);
        }
        return {
          shipmentId: val.shipmentNumber,
          driverNumber: val.driverNumber || '',
          truckNumber: val.truckNumber || '',
          shipmentStatus: SHIPMENT_STATUS[val.shipmentState],
          shippedOn:
            val.shipmentState === 'Dispatched'
              ? formatDate(val.dispatchedOn)
              : formatDate(val.deliveredOn),
          priceTotal: {
            currencyCode: DEFAULT_CURRENCY_CODE,
            totalAmount: val.totalInvoicedAmount,
          },
          products: getProductsFromItemDetails(val.itemDetails),
          downloadInvoiceAndDocumentDetails,
          pbOrder: val.pbOrder,
          orderTag: ORDER_TAG,
          trackingUrl: preProcessTrackingUrl(
            val.trackingUrl as string | null | undefined,
          ),
        };
      }
      return null;
    })
    .filter((val) => val !== null);
}

export function getProductsFromItemDetails(itemDetails) {
  return itemDetails.map((val) => {
    return {
      ...transformSingleProduct(val),
      brand: val.brandName,
      sellerName: val.sellerName,
    };
  });
}

export function transformSingleProduct(item) {
  const attributes = createAttributes(item);
  const { quantity, uomLabel } = parseQuantity(item.quantity);
  return {
    displayName: item.productName,
    uomLabel,
    quantity,
    attributes,
  };
}

export function parseQuantity(quantity: string | null): {
  quantity: string;
  uomLabel: string;
} {
  if (quantity !== null) {
    const [value, uomLabel] = quantity.split(' ');
    return { quantity: value, uomLabel };
  }
  return { quantity: '', uomLabel: '' };
}

export function createAttributes(item) {
  let attributes: any[] = [];
  attributes = transformAttributes(item.attributes);

  return attributes;
}

export function transformAttributes(attributesObj) {
  const attributes = Object.entries(attributesObj).map(([key, rawValue]) => {
    const raw = typeof rawValue === 'string' ? rawValue : '';
    const [description] = key.split(' (');

    const [value, uom] = raw.split(' ');
    return {
      description,
      value,
      uom,
      colourCode: '',
    };
  });
  const dimensionKeys = ['Thickness', 'Width', 'Length'];
  const dimensions = {};
  const output: any[] = [];

  for (const attr of attributes) {
    if (dimensionKeys.includes(attr.description)) {
      dimensions[attr.description] = attr.value;
    } else {
      if (attr.description === 'Colour') {
        const [value, code] = attr.value.split('-');
        attr.value = value?.replace('_', ' ');
        attr.colourCode = code;
        attr.uom = '';
      }
      output.push(attr);
    }
  }

  if (Object.entries(dimensions).length > 0) {
    let expression = '';
    let des = '';
    dimensionKeys.forEach((key) => {
      if (dimensions[key] !== undefined) {
        des = des.concat(key, ' x ');
        expression = expression.concat(`${dimensions[key]} X `);
      }
    });
    output.push({
      description: des.substring(0, des.length - 3),
      value: expression.substring(0, expression.length - 3),
      uom: 'mm',
      colourCode: '',
    });
  }
  return output;
}
function preProcessTrackingUrl(trackingUrl: string | null | undefined): string {
  if (!trackingUrl) {
    return '';
  }

  // Convert http to https
  if (trackingUrl.startsWith('http://')) {
    return trackingUrl.replace('http://', 'https://');
  }

  return trackingUrl;
}
