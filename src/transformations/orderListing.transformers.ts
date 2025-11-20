/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import {
  APP_STATUS_FOR_MSME,
  APP_STATUS_PB_WHEN__FULLFILLEDBY_JSW_ONE,
  APP_STATUS_PB_WHEN__FULLFILLEDBY_JSW_ONE_DISTRIBUTOR,
  APP_STATUS_PB_WHEN_NO_FULLFILLEDBY_PRESENT,
  CONNECTOR_ORDER_TYPE_MAPPING,
  DEFAULT_CURRENCY_CODE,
  ERP_ORDER_STATUS,
  ERP_ORDER_STATUS_MAPPING,
  ERP_ORDER_TYPE_MAPPING,
  ERP_SHIP_TO_TYPE_MAPPING,
  ORDER_LIST_UOM_MAPPING,
  ORDER_TAG,
  PB_ORDER_TAGS,
  UOM,
} from 'src/config/app.config';
import { formatDate } from 'src/utils/common-functions.util';
import { transformSingleProduct } from './shipments.transformers';
import { HttpStatusCode } from 'axios';
import { CustomError } from 'src/utils/CustomError';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
export function transformOrderListingRequest(request) {
  if (request.url.searchParams) {
    const customerType = request.url.searchParams.get('customerType');
    const developerName = getDeveloperName(customerType);
    const gstin = request.url.searchParams.get('gstin');
    if (!gstin) {
      throw new CustomError('Gstin not found', HttpStatusCode.BadRequest);
    }

    request.url.searchParams.set('developerName', developerName);
    request.url.searchParams.delete('customerType');
    request.body = null;
    return request;
  }
}

export function getDeveloperName(customerType) {
  let developerName = 'MSME';
  if (customerType === 'Retailer PB' || customerType === 'Influencer') {
    developerName = 'PrivateBrand';
  }
  return developerName;
}

export function transformOrderListingResponse(response) {
  const orderListingResult = response?.data?.data;
  if (orderListingResult) {
    const OrderListResponse =
      sortProductsArrayBasedOnCreatedDate(orderListingResult);
    const orderList = transformV2OrderListResponse(OrderListResponse);

    return { orderList: orderList };
  }
  return { orderList: [] };
}

export function sortProductsArrayBasedOnCreatedDate(products) {
  const sortedProductsArray = [...products].sort((productA, productB) => {
    return (
      new Date(productB.createdDate).getTime() -
      new Date(productA.createdDate).getTime()
    );
  });
  return sortedProductsArray;
}

export function transformV2OrderListResponse(ordersArray) {
  return ordersArray.map((order) => {
    if (order.isOrder === true) {
      const products = transformOrderListProducts(order);

      if (
        order.orderType === ERP_ORDER_TYPE_MAPPING.PRIVATE_BRAND &&
        order.shipToType === ERP_SHIP_TO_TYPE_MAPPING.SECONDARY &&
        (order.orderStatus === ERP_ORDER_STATUS.Placed ||
          order.orderStatus === ERP_ORDER_STATUS.Created)
      ) {
        order.orderStatus = ERP_ORDER_STATUS.Order_Created;
      }

      return {
        isOrder: order.isOrder,
        orderId: order.orderNumber,
        orderStatus: ERP_ORDER_STATUS_MAPPING[order.orderStatus] ?? '',
        orderPlacedDate: formatDate(order.createdDate),
        totalAmount: {
          currencyCode: DEFAULT_CURRENCY_CODE,
          totalAmount: order.totalOrderAmount,
        },
        orderType: order.orderType ?? '',
        shipToType: order.shipToType ?? '',
        orderTag: ORDER_TAG,
        products: products,
      };
    }
    if (order.isOrder === false) {
      const products = transformOpportunityListProducts(order);
      const orderStatus = getAppStatusFromOpportunities(order);
      const orderTag = getOrderTag(order);
      const orderType = getOrderType(order.orderType);

      return {
        isOrder: order.isOrder,
        orderId: order.orderId,
        orderStatus: orderStatus,
        orderPlacedDate: formatDate(order.createdDate),
        totalAmount: {
          currencyCode: '',
          totalAmount: 0,
        },
        orderType: orderType,
        shipToType: order.shipToType ?? '',
        orderTag: orderTag,
        products: products,
      };
    }
  });
}

export function transformOrderListProducts(order) {
  return order.itemDetails.map(transformSingleProduct);
}

export function transformOpportunityListProducts(order) {
  return order.itemDetails.map((item) =>
    transformSingleOpportunityProduct(item, order.orderType),
  );
}

export function transformSingleOpportunityProduct(item, orderType: string) {
  const attributes = createAttributesForOpportunities(item, orderType);

  const { quantity, uomLabel } = parseProductQuantity(item.quantity);
  return {
    displayName: item.productName || '',
    uomLabel,
    quantity,
    attributes,
  };
}

export function parseProductQuantity(quantity: string | null): {
  quantity: string;
  uomLabel: string;
} {
  if (quantity) {
    const firstSpaceIndex = quantity.indexOf(' ');
    if (firstSpaceIndex !== -1) {
      const value = quantity.substring(0, firstSpaceIndex);
      const uomLabel = quantity.substring(firstSpaceIndex + 1);
      return {
        quantity: value,
        uomLabel: ORDER_LIST_UOM_MAPPING[uomLabel] || uomLabel,
      };
    }
    return { quantity, uomLabel: '' };
  }
  return { quantity: '', uomLabel: '' };
}

export function createAttributesForOpportunities(item, orderType: string) {
  let attributes: any[] | [] = [];
  if (orderType === ERP_ORDER_TYPE_MAPPING.MSME) {
    if (item.productName.includes('TMT')) {
      const [productName, diameter] = item.productName
        .split('-')
        .map((name) => name.trim());
      item.productName = productName || '';

      const itemAttributes = item.attributes;

      if (
        itemAttributes &&
        typeof itemAttributes === 'object' &&
        'keys' in itemAttributes
      ) {
        if (itemAttributes.keys === '') {
          const key = 'Dia (mm)';
          const value = `${diameter}`;
          item.attributes = {
            keys: key,
            values: value,
          };
        }
        if (itemAttributes.keys === 'TMT Form') {
          const tmtForm = itemAttributes.values;
          const key = 'Dia (mm) x TMT Form';
          const value = `${diameter} x ${tmtForm}`;
          item.attributes = {
            keys: key,
            values: value,
          };
        }
      }
    }
  }
  attributes = transformOpportunityAttributes(item.attributes);
  return attributes;
}

export function transformOpportunityAttributes({ keys, values }) {
  if (keys === '' && values === '') {
    return [];
  }
  const keyParts = keys.split(' x ').map((k) => k.trim());
  const valueParts = values.split(' x ').map((v) => v.trim());

  const getFieldName = (key: string): string =>
    key.replace(/\s*\(.*?\)/, '').trim();

  const simplifiedKey = keyParts.map(getFieldName).join(' x ');

  switch (simplifiedKey) {
    case 'Dia':
      return [
        buildAttribute('Diameter', valueParts[0], extractUOM(keyParts[0])),
      ];

    case 'Dia x TMT Form':
      return [
        buildAttribute('Diameter', valueParts[0], extractUOM(keyParts[0])),
        buildAttribute('Form', valueParts[1], ''),
      ];

    case 'TH x WD x LN':
      return [
        buildAttribute(
          'Thickness x Width x Length',
          `${valueParts[0]} X ${valueParts[1]} X ${valueParts[2]}`,
          extractUOM(keyParts[0]),
        ),
      ];

    case 'TH x WD':
      return [
        buildAttribute(
          'Thickness x Width',
          `${valueParts[0]} X ${valueParts[1]}`,
          extractUOM(keyParts[0]),
        ),
      ];

    case 'Leg x TH':
      return [
        buildAttribute('Leg length', valueParts[0], extractUOM(keyParts[0])),
        buildAttribute('Thickness', valueParts[1], extractUOM(keyParts[1])),
      ];

    case 'Web Depth x Flange Width x Sectional Weight':
      return [
        buildAttribute('Web Depth', valueParts[0], extractUOM(keyParts[0])),
        buildAttribute('Flange Width', valueParts[1], extractUOM(keyParts[1])),
        buildAttribute(
          'Sectional Weight',
          valueParts[2],
          extractUOM(keyParts[2]),
        ),
      ];

    case 'TH x WD x Spangle type x Coating grade':
      return [
        buildAttribute('Spangle type', valueParts[2]),
        buildAttribute('Coating grade', valueParts[3], UOM.GSM),
        buildAttribute(
          'Thickness x Width',
          `${valueParts[0]} X ${valueParts[1]}`,
          extractUOM(keyParts[0]),
        ),
      ];

    case 'TH x WD x LN x Spangle type x Coating grade':
      return [
        buildAttribute('Spangle type', valueParts[3]),
        buildAttribute('Coating grade', valueParts[4], UOM.GSM),
        buildAttribute(
          'Thickness x Width x Length',
          `${valueParts[0]} X ${valueParts[1]} X ${valueParts[2]}`,
          extractUOM(keyParts[0]),
        ),
      ];

    case 'TH x WD x Coating grade':
      return [
        buildAttribute('Coating grade', valueParts[2], UOM.GSM),
        buildAttribute(
          'Thickness x Width',
          `${valueParts[0]} X ${valueParts[1]}`,
          extractUOM(keyParts[0]),
        ),
      ];

    case 'TH x WD x LN x Coating grade':
      return [
        buildAttribute('Coating grade', valueParts[3], UOM.GSM),
        buildAttribute(
          'Thickness x Width x Length',
          `${valueParts[0]} X ${valueParts[1]} X ${valueParts[2]}`,
          extractUOM(keyParts[0]),
        ),
      ];

    case 'TH x WD x LN x Coating grade x PPGL Colour':
      return [
        getPPGLColorInfo(valueParts[4]),
        buildAttribute('Coating grade', valueParts[3], UOM.GSM),
        buildAttribute(
          'Thickness x Width x Length',
          `${valueParts[0]} X ${valueParts[1]} X ${valueParts[2]}`,
          extractUOM(keyParts[0]),
        ),
      ];

    case 'TH x WD x Coating grade x PPGL Colour':
      return [
        getPPGLColorInfo(valueParts[3]),
        buildAttribute('Coating grade', valueParts[2], UOM.GSM),
        buildAttribute(
          'Thickness x Width',
          `${valueParts[0]} X ${valueParts[1]}`,
          extractUOM(keyParts[0]),
        ),
      ];

    default:
      return [];
  }
}

export function extractUOM(key: string): string {
  const match = key.match(/\((.*?)\)/);
  return match ? match[1] : '';
}

export function buildAttribute(description: string, value: string, uom = '') {
  return {
    description,
    value,
    uom,
    colourCode: '',
  };
}

export function getPPGLColorInfo(input: string) {
  const [nameRaw, code] = input.split('-');
  const name = nameRaw.replace(/_/g, ' ');
  return {
    description: 'Colour',
    value: name,
    uom: '',
    colourCode: code,
  };
}

export function getAppStatusFromOpportunities(order) {
  if (!order || !order.orderType || !order.orderStatus) {
    return '';
  }

  if (order.orderType === ERP_ORDER_TYPE_MAPPING.MSME) {
    return APP_STATUS_FOR_MSME[order.orderStatus.toLowerCase()] ?? '';
  }

  if (order.orderType === CONNECTOR_ORDER_TYPE_MAPPING.PRIVATE_BRAND) {
    const fullfilledBy = order.fulfilledBy?.trim() ?? '';

    if (
      fullfilledBy === '' ||
      fullfilledBy === null ||
      fullfilledBy === undefined
    ) {
      return (
        APP_STATUS_PB_WHEN_NO_FULLFILLEDBY_PRESENT[
          order.orderStatus.toLowerCase()
        ] ?? ''
      );
    }

    if (fullfilledBy === 'JSW One') {
      return (
        APP_STATUS_PB_WHEN__FULLFILLEDBY_JSW_ONE[
          order.orderStatus.toLowerCase()
        ] ?? ''
      );
    }

    if (fullfilledBy === 'Warehouse') {
      return (
        APP_STATUS_PB_WHEN__FULLFILLEDBY_JSW_ONE_DISTRIBUTOR[
          order.orderStatus.toLowerCase()
        ] ?? ''
      );
    }
  }

  return '';
}

export function getOrderTag(order) {
  let orderTag = '';
  if (order.orderType === ERP_ORDER_TYPE_MAPPING.MSME) {
    orderTag = ORDER_TAG;
  }

  if (order.orderType === CONNECTOR_ORDER_TYPE_MAPPING.PRIVATE_BRAND) {
    orderTag = PB_ORDER_TAGS[order.fulfilledBy as string] ?? '';
  }
  return orderTag;
}

export function getOrderType(pbOrderType) {
  let orderType = '';
  if (
    pbOrderType &&
    pbOrderType === CONNECTOR_ORDER_TYPE_MAPPING.PRIVATE_BRAND
  ) {
    orderType = ERP_ORDER_TYPE_MAPPING.PRIVATE_BRAND;
  } else {
    orderType = pbOrderType;
  }
  return orderType;
}

export function mergeMaterialTrackingAndOrderListingResponses(
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

    const materialTrackingResponse = responses['app-material-tracking'];
    const orderListingResponse = responses['app-order-listing'];

    if (
      !materialTrackingResponse ||
      typeof materialTrackingResponse.data !== 'object' ||
      materialTrackingResponse.data === null
    ) {
      Logger.error(
        `Error for Orders Page API method: mergeMaterialTrackingAndOrderListingResponses Strapi response is missing or invalid`,
      );
      return { data: {}, meta: {} };
    }

    const materialTrackingResponseData = {
      ...materialTrackingResponse.data.data,
    };

    let originalBlocks: unknown[] = [];
    if (
      typeof materialTrackingResponse.data === 'object' &&
      materialTrackingResponse.data.data !== null &&
      Array.isArray(
        (materialTrackingResponse.data.data as { blocks?: unknown[] }).blocks,
      )
    ) {
      originalBlocks = [
        ...((materialTrackingResponse.data.data as { blocks?: unknown[] })
          .blocks as unknown[]),
      ];
    }
    const blocks: any[] = originalBlocks;
    const materialTrackingBlock = blocks.find(
      (block) => block.__component === 'app-components.app-cart-product',
    );
    if (materialTrackingBlock) {
      if (
        orderListingResponse.success &&
        orderListingResponse.data.orderList &&
        orderListingResponse.data.orderList.length > 0
      ) {
        materialTrackingBlock.orderList = orderListingResponse.data.orderList;
      } else {
        materialTrackingBlock.orderList = [];
      }
    }
    materialTrackingResponseData.blocks = blocks;

    return {
      data: materialTrackingResponseData,
    };
  } catch (error) {
    Logger.log(
      `Transforming Shipment Request  method: mergeMaterialTrackingAndOrderListingResponses`,
    );
    console.error(
      'Error in mergeMaterialTrackingAndOrderListingResponses:',
      error,
    );
    throw error;
  }
}
