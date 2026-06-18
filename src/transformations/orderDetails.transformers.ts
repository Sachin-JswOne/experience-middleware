import { Logger } from '@nestjs/common';
import {
  CONNECTOR_ORDER_TYPE_MAPPING,
  DEFAULT_CURRENCY_CODE,
  DEFAULT_VALUE,
  ERP_ORDER_STATUS,
  ERP_ORDER_STATUS_MAPPING,
  ORDER_TAG,
  PAYMENT_STATUS_MAPPING,
} from 'src/config/app.config';
import { BaseRequest } from 'src/models/base-request.model';
import { convertToDouble, formatDate, safeDebug } from 'src/utils/common-functions.util';
import { transformSingleProduct } from './shipments.transformers';
import { CustomError } from 'src/utils/CustomError';
import {
  getAppStatusFromOpportunities,
  getDeveloperName,
  getOrderTag,
  transformSingleOpportunityProduct,
} from './orderListing.transformers';

export function selectOrderDetailTarget(request): string {
  const isOrderFlag = request.query.isOrder;
  const isOrder = isOrderFlag === 'true';

  if (isOrder) {
    return 'order-detail';
  } else {
    return 'opportunity-detail';
  }
}

export function transformOrderDetailsRequest(request: BaseRequest) {
  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: null,
  };
  const orderNumber = request?.params?.id;
  finalTransformedRequest.url.search = `?orderNumber=${orderNumber}`;
  return finalTransformedRequest;
}

export function transformOrderDetailsResponse(response: any) {
  const orderDetailsResponse = response?.data?.data;
  safeDebug(
    Logger,
    () =>
      ` Connector Order Details Api response from method: transformOrderDetailsResponse : ${JSON.stringify(
        orderDetailsResponse,
      )}`,
  );
  if (orderDetailsResponse) {
    const orderDetails = transformOrderDetails(orderDetailsResponse);
    return { orderDetails };
  }
  Logger.error(
    `For method: transformOrderDetailsRequest Connector Order Detail API Is throwing error'`,
  );
  throw new CustomError(response.errors, response.responseCode);
}

export function transformOrderDetails(data) {
  if (data) {
    const billingAddress = data.billingAddress;
    const shippingAddress = data.shippingAddress;

    if (
      data.orderStatus === ERP_ORDER_STATUS.Placed ||
      data.orderStatus === ERP_ORDER_STATUS.Created
    ) {
      data.orderStatus = ERP_ORDER_STATUS.Order_Created;
    }

    return {
      orderId: data.orderNumber,
      orderTag: ORDER_TAG,
      orderStatus: ERP_ORDER_STATUS_MAPPING[data.orderStatus] || '',
      orderPlacedDate: formatDate(data.createdDate),
      pbOrder: data.pbOrder,
      priceTotal: {
        currencyCode: DEFAULT_CURRENCY_CODE,
        subTotal: convertToDouble(data.totalPrice),
        taxAmount: convertToDouble(data.totalTaxes),
        totalAmount: convertToDouble(data.totalOrderAmount),
      },
      payments: {
        paymentStatus: PAYMENT_STATUS_MAPPING[data.paymentStatus] || '',
        paymentReceived: data.totalPaymentReceived,
        pendingPayment: data.totalPaymentPending,
      },
      shippingAddress: {
        id: shippingAddress.id || '',
        streetLine1: shippingAddress.streetLine1 || '',
        city: shippingAddress.city || '',
        region: shippingAddress.region || '',
        state: shippingAddress.state || '',
        name: shippingAddress.name || '',
        postalCode: shippingAddress.postalCode.toString() || '',
        mobileNumber: shippingAddress.mobileNumber || '',
        companyName: shippingAddress.companyName || '',
      },
      billingAddress: {
        id: billingAddress.id || '',
        streetLine1: billingAddress.streetLine1 || '',
        city: billingAddress.city || '',
        region: billingAddress.region || '',
        state: billingAddress.state || '',
        name: billingAddress.name || '',
        postalCode: billingAddress.postalCode?.toString() || '',
        mobileNumber: billingAddress.mobileNumber || '',
        companyName: billingAddress.companyName || '',
      },
      products: getProductsForOrderDetails(data),
    };
  }
}

export function getProductsForOrderDetails(data) {
  const products = data.itemDetails?.map((val) => {
    return {
      brand: val.brandName,
      sellerName: val.sellerName,
      ...transformSingleProduct(val),
      itemPrice: {
        currencyCode: DEFAULT_CURRENCY_CODE,
        price: val.price,
        totalPrice: val.totalPrice,
        taxPercentage: Math.round(val.taxPercentage * 100),
      },
    };
  });

  return products;
}

export function transformOpportunityDetailsRequest(request) {
  const customerType = request.url.searchParams.get('customerType');
  const developerName = getDeveloperName(customerType);

  request.url.searchParams.set('developerName', developerName);
  request.url.searchParams.delete('customerType');
  request.url.searchParams.set('opportunityId', request.params.id);
  return request;
}

export function transformOpportunityDetailsResponse(response: any) {
  const opportunityDetailsResponse = response?.data?.data;
  safeDebug(
    Logger,
    () =>
      ` Connector Opportunity Details Api response from method: transformOpportunityDetailsResponse : ${JSON.stringify(
        opportunityDetailsResponse,
      )}`,
  );
  if (opportunityDetailsResponse) {
    const opportunityDetails = transformOpportunityDetails(opportunityDetailsResponse);
    return { orderDetails: opportunityDetails };
  }
  Logger.error(
    `For method: transformOpportunityDetailsResponse Connector Opportunity Detail API Is throwing error'`,
  );
  throw new CustomError(response.errors, response.responseCode);
}

export function transformOpportunityDetails(data) {
  const billingAddress = data.billingAddress || {};
  const shippingAddress = data.shippingAddress || {};

  const orderStatus = getAppStatusFromOpportunities(data);
  let pbOrder = false;
  if (data.orderType === CONNECTOR_ORDER_TYPE_MAPPING.PRIVATE_BRAND) {
    pbOrder = true;
  }
  const orderTag = getOrderTag(data);

  return {
    orderId: '',
    orderTag: orderTag,
    orderStatus: orderStatus || '',
    pbOrder: pbOrder,
    orderPlacedDate: formatDate(data.createdDate),
    priceTotal: {
      currencyCode: '',
      subTotal: DEFAULT_VALUE,
      taxAmount: DEFAULT_VALUE,
      totalAmount: DEFAULT_VALUE,
    },
    payments: {
      paymentStatus: '',
      paymentReceived: DEFAULT_VALUE,
      pendingPayment: DEFAULT_VALUE,
    },
    shippingAddress: {
      id: shippingAddress.id || '',
      streetLine1: shippingAddress.streetLine1 || '',
      city: shippingAddress.city || '',
      region: shippingAddress.region || '',
      state: shippingAddress.state || '',
      name: shippingAddress.name || '',
      postalCode: shippingAddress.postalCode?.toString() || '',
      mobileNumber: shippingAddress.mobileNumber || '',
      companyName: shippingAddress.companyName || '',
    },
    billingAddress: {
      id: billingAddress.id || '',
      streetLine1: billingAddress.streetLine1 || '',
      city: billingAddress.city || '',
      region: billingAddress.region || '',
      state: billingAddress.state || '',
      name: billingAddress.name || '',
      postalCode: billingAddress.postalCode?.toString() || '',
      mobileNumber: billingAddress.mobileNumber || '',
      companyName: billingAddress.companyName || '',
    },
    products: getProductsForOpportunityDetails(data),
  };
}

export function getProductsForOpportunityDetails(data) {
  const products = data.itemDetails?.map((val) => {
    return {
      brand: val.brandName || '',
      sellerName: val.sellerName || '',
      ...transformSingleOpportunityProduct(val, data.orderType),
      itemPrice: {
        currencyCode: '',
        price: DEFAULT_VALUE,
        totalPrice: DEFAULT_VALUE,
        taxPercentage: DEFAULT_VALUE,
      },
    };
  });

  return products;
}
