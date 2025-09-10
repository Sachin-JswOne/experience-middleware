export interface AddressResponse {
  returnCode: number;
  message: string;
  APIName: string;
  addressData: string;
}

export interface PostAddressResponse {
  siteId: string;
  returnCode: number;
  message: string;
  APIName: string;
  AddressId: string;
}

export interface AddressRequestBody {
  accountId: string;
  projectName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
}

export interface AddressPayload {
  SiteAddressDataList: AddressRequestBody[];
}
