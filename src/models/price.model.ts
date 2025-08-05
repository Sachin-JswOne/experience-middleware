export interface priceRequest {
  pincode: string;
  key: string;
  quantity: number;
  productMMID: string;
  category: string;
  subCategory: string;
  productAttributes: { key: string; value: string }[];
}

export interface priceResponse {
  success: boolean;
  data: object;
  price: PriceObject;
  minMoq: number;
  customAttributes: { key: string; value: string }[];
}

export interface PriceObject {
  primaryUomVariantPrice: number;
  displayPrimaryUomVariantPrice: string;
  primaryUom: string;
  primaryUomValue: string;
  displayPrimaryUomValue: string;
  variantLineItemPrice: number;
  primaryUomLabel: string;
  displayVariantLineItemPrice: string;
  pricingMode: string;
}
