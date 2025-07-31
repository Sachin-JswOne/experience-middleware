/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  CCP_PRICE_API_ATTRIBUTES_MAPPING,
  PRODUCT_TYPE_KEYS,
} from 'src/config/app.config';
import { BaseRequest } from 'src/models/base-request.model';
import { convertAuthorizationToAccessTokenInHeader } from './general.transformers';
import { priceRequest, priceResponse } from 'src/models/price.model';

export function transformLineItemPriceRequest(
  request: BaseRequest,
): BaseRequest {
  const transformedRequest = convertAuthorizationToAccessTokenInHeader(request);

  const requestBody: priceRequest = request?.body;
  const variantMMID = getVariantMMID(
    requestBody?.category,
    requestBody?.productMMID,
  );

  const productVariantKey = getProductVariantKey(
    requestBody?.key,
    requestBody?.productAttributes,
  );

  const customAttributes = getCustomAttributes(
    requestBody?.subCategory,
    requestBody?.quantity,
  );

  const productAttributes = getProductAttributes(
    requestBody?.productAttributes,
    requestBody?.subCategory,
  );

  const reqBody = {
    pincode: requestBody?.pincode,
    productVariantKey: productVariantKey,
    customAttributes: customAttributes,
    variantMMID: variantMMID,
    productAttributes: productAttributes,
    productTypeKey: PRODUCT_TYPE_KEYS[requestBody.subCategory] || '',
  };
  const finalTransformedRequest: BaseRequest = {
    ...transformedRequest,
    body: reqBody,
  };

  return finalTransformedRequest;
}

export function getProductVariantKey(
  key: string,
  productAttributes: { key: string; value: string }[],
): string {
  if (!key || !productAttributes) {
    return '';
  }
  if (productAttributes.length === 0) {
    return key;
  }
  const productVariantKey = `${key}-${productAttributes.map((attr) => attr.value).join('-')}`;
  return productVariantKey;
}

export function getCustomAttributes(subCategory: string, quantity: number) {
  if (!subCategory || !quantity) {
    return [];
  }
  if (subCategory === 'Cement') {
    return [{ key: 'NUMBER_OF_BAGS', value: quantity.toString() }];
  }
  if (subCategory.includes('Sheets')) {
    return [
      {
        key: 'NUMBER_OF_SHEETS',
        value: quantity.toString(),
      },
    ];
  }
  return [
    {
      key: 'QUANTITY',
      value: quantity.toString(),
    },
  ];
}

export function getVariantMMID(category: string, productMMID: string): string {
  let variantMMID = '';
  if (category === 'Cement') {
    variantMMID = productMMID;
  } else {
    variantMMID = productMMID + '-10000000';
  }
  return variantMMID;
}

export function transformLineItemPriceResponse(response: priceResponse) {
  if (response.success && response?.price) {
    return {
      price: response?.price?.displayVariantLineItemPrice || 0,
    };
  }
  return {
    price: 0,
  };
}

export function getProductAttributes(
  productAttributes: { key: string; value: string }[],
  subCategory: string,
): { key: string; value: string }[] {
  if (!productAttributes || productAttributes.length === 0) {
    return [];
  }

  return productAttributes.map((attr) => {
    let attributeKey = attr.key;

    if (
      ['GL Coils', 'GL Sheets', 'PPGL Coils', 'PPGL Sheets'].includes(
        subCategory,
      ) &&
      attr.key === 'coating_grade_gsm'
    ) {
      attributeKey = 'coating_grade_gsm_gl_ppgl';
    } else if (
      ['GI Coils', 'GI Sheets'].includes(subCategory) &&
      attr.key === 'coating_grade_gsm'
    ) {
      attributeKey = 'coating_grade_gsm_gi';
    }

    return {
      key: CCP_PRICE_API_ATTRIBUTES_MAPPING[attributeKey],
      value: attr.value,
    };
  });
}
