/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ERP_DOCUMENTS_MAPPING } from 'src/config/app.config';
import {
  Document,
  InvoiceAndDocuments,
} from 'src/models/invoice-and-documents.model';
import { formatDate } from 'src/utils/common-functions.util';

export function transformInvoiceAndDocuments(response: any): {
  listOfDocuments: InvoiceAndDocuments[] | [];
} {
  try {
    if (!response || typeof response !== 'object') {
      return { listOfDocuments: [] };
    }
    const invoiceDocumentsResponse = response?.data?.data;

    if (
      invoiceDocumentsResponse &&
      invoiceDocumentsResponse?.orderShipmentSummaryList &&
      Array.isArray(invoiceDocumentsResponse?.orderShipmentSummaryList) &&
      invoiceDocumentsResponse?.orderShipmentSummaryList.length > 0
    ) {
      const listOfDocuments =
        invoiceDocumentsResponse.orderShipmentSummaryList.map(
          (orderShipment) => {
            const documents = transformDocuments(orderShipment);

            return {
              shipmentNumber: orderShipment.shipmentNumber || '',
              dispatchedOn: formatDate(orderShipment.dispatchedOn) || '',
              documents: documents,
              pbOrder: orderShipment.pbOrder,
            };
          },
        );
      return { listOfDocuments: listOfDocuments };
    } else {
      return { listOfDocuments: [] };
    }
  } catch (error) {
    console.error('Error in transformInvoiceAndDocuments:', error);
    return { listOfDocuments: [] };
  }
}

export function transformDocuments(orderShipment): Document[] {
  const documentTypes = ['invoice', 'testCertificate', 'other'];

  return documentTypes.map((type) =>
    transformDocumentType(orderShipment, type),
  );
}

export function transformDocumentType(orderShipment, type: string): Document {
  const name = ERP_DOCUMENTS_MAPPING[type];
  let fileName = '';
  let signedUrl = '';

  if (orderShipment[type]?.length) {
    fileName = orderShipment[type][0].fileName; //Erp team currently sending random file name, hence we are doing [0] instead of finding by filename.
    signedUrl = orderShipment[type][0].signedUrl;
  }
  return {
    name: name,
    fileName: fileName,
    signedUrl: signedUrl,
  };
}
