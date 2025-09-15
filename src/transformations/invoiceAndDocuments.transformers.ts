/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { formatDate, toTitleCase } from 'src/utils/common-functions.util';

export function transformInvoiceAndDocuments(response: any): {
  listOfDocuments;
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
      const listOfDocuments = getListOfDocuments(invoiceDocumentsResponse);
      return { listOfDocuments: listOfDocuments };
    } else {
      return { listOfDocuments: [] };
    }
  } catch (error) {
    console.error('Error in transformInvoiceAndDocuments:', error);
    return { listOfDocuments: [] };
  }
}

export function getListOfDocuments(invoiceDocumentsResponse) {
  const listOfDocuments = invoiceDocumentsResponse.orderShipmentSummaryList.map(
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
  return listOfDocuments;
}

export function transformDocuments(orderShipment) {
  const documentTypes = ['invoice', 'testCertificate', 'other'];

  return documentTypes.map((type) =>
    transformDocumentType(orderShipment, type),
  );
}

export function transformDocumentType(orderShipment, type: string) {
  const name = toTitleCase(type);
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
