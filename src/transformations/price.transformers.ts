import { PRODUCT_TYPE_KEYS } from 'src/config/app.config';
import { BaseRequest } from 'src/models/base-request.model';
import { convertAuthorizationToAccessTokenInHeader } from './general.transformers';

export function transformLineItemPriceRequest(
  request: BaseRequest,
): BaseRequest {
  const transformedRequest = convertAuthorizationToAccessTokenInHeader(request);

  const requestBody = request.body;
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

  const reqBody = {
    pincode: requestBody?.pincode,
    productVariantKey: productVariantKey,
    customAttributes: customAttributes,
    variantMMID: variantMMID,
    productAttributes: request?.body?.productAttributes,
    productTypeKey: PRODUCT_TYPE_KEYS[request?.body?.subCategory] || '',
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

export function transformLineItemPriceResponse(response) {
  if (response.success && response.data) {
    return {
      price: response?.data?.price?.displayVariantLineItemPrice || 0,
    };
  }
  return {
    price: 0,
  };
}
