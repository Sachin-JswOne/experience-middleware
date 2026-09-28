import { formatDate, toTitleCase } from 'src/utils/common-functions.util';
import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';

export function transformInvoiceAndDocuments(response: any): {
  listOfDocuments;
} {
  try {
    safeDebug(
      Logger,
      () =>
        `Invoice and Documents Api response from method: transformInvoiceAndDocuments : ${JSON.stringify(
          response,
        )}`,
    );
    if (!response || typeof response !== 'object') {
      return { listOfDocuments: [] };
    }
    const invoiceDocumentsResponse = response;

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
    Logger.error(
      `Error for Invoice and Documents API method: transformInvoiceAndDocuments ${error}`,
    );
    return { listOfDocuments: [] };
  }
}

export function getListOfDocuments(invoiceDocumentsResponse) {
  const listOfDocuments = invoiceDocumentsResponse.orderShipmentSummaryList.map((orderShipment) => {
    const documents = transformDocuments(orderShipment);

    return {
      invoiceNumber: orderShipment.invoiceNumber || '',
      shipmentNumber: orderShipment.shipmentNumber || '',
      dispatchedOn: formatDate(orderShipment.dispatchedOn) || '',
      documents: documents,
      pbOrder: orderShipment.pbOrder,
    };
  });
  return listOfDocuments;
}

export function transformDocuments(orderShipment) {
  const documentTypes = ['invoices', 'testCertificates', 'weightmentSlips', 'lorryReceipt', 'other'];
  
  return documentTypes.map((type) => transformDocumentType(orderShipment, type));
}

export function transformDocumentType(orderShipment, type: string) {
  let name = toTitleCase(type);
  let fileName = '';
  let signedUrl = '';

  if (orderShipment[type]?.length) {
    fileName = orderShipment[type][0].fileName; //Erp team currently sending random file name, hence we are doing [0] instead of finding by filename.
    signedUrl = orderShipment[type][0].signedUrl;
  }
  if (orderShipment.pbOrder) {
    if (name === 'Invoices') name = 'Invoice';
  }
  return {
    name: name,
    fileName: fileName,
    signedUrl: signedUrl,
  };
}
