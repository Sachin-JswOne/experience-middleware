import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';

export function validateAndTransformTicketRequest(
  request: BaseRequest,
): BaseRequest {
  const body = request.body ?? {};

  const {
    orderNumber,
    invoiceNumber,
    shipmentSKUIds,
  } = body;

  // if (!orderNumber && !invoiceNumber) {
  //   throw new CustomError(
  //     'Either orderNumber or invoiceNumber is required',
  //     400,
  //   );
  // }

  // if (invoiceNumber) {
  //   // const hasOpportunitySkus =
  //   //   Array.isArray(opportunitySKUIds) &&
  //   //   opportunitySKUIds.length > 0;

  //   const hasShipmentSkus =
  //     Array.isArray(shipmentSKUIds) &&
  //     shipmentSKUIds.length > 0;

  //   if (!hasShipmentSkus) {
  //     throw new CustomError(
  //       'When invoiceNumber is provided, shipmentSKUIds is required',
  //       400,
  //     );
  //   }
  // }

  return request;
}