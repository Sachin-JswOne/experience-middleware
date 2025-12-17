import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';

interface AddressCustomFields {
  streetLine1?: string;
  isPrimaryAddress?: boolean;
  modifiedBy?: string;
  shipToParty?: string;
  createdAt?: string;
  modifiedAt?: string;
}

interface AddressCustom {
  type: {
    id: string;
    obj: any;
    typeId: string;
  };
  fields: AddressCustomFields;
}

interface Address {
  id: string;
  key?: string;
  title?: string | null;
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  streetName?: string | null;
  streetNumber?: string | null;
  additionalStreetInfo?: string | null;
  postalCode?: string;
  city?: string;
  region?: string;
  state?: string;
  country?: string;
  company?: string;
  department?: string | null;
  building?: string | null;
  apartment?: string | null;
  pOBox?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  fax?: string | null;
  additionalAddressInfo?: string | null;
  externalId?: string | null;
  custom?: AddressCustom;
}

interface UserProfileResponse {
  id: string;
  firstName: string;
  userEmail: string;
  phoneNumber: string;
  lastName: string;
  companyName: string;
  razorPayName?: string;
  razorPayVaAccountNumber?: string;
  razorPayIFSC?: string;
  defaultShippingAddressId?: string;
  defaultBillingAddressId?: string;
  addresses: Address[];
  salesClassification?: string;
  sfAccountId?: string;
  gstIn?: string;
  erpOrderCreationEnabled?: boolean;
  erpBackwardFlowEnabled?: boolean;
  erpEnableUsers?: any[];
  zohoFlagEnabled?: boolean;
  zohoEnableUsers?: any[];
  gtmDate?: string;
  creditFlag?: boolean;
  isDirectCustomer?: boolean;
  isEligibleSellerCredit?: boolean;
  isLedgerEnable?: boolean;
  allowLinkTDC?: boolean;
  isCentralCartSloEnabled?: boolean;
  isCentralCartStoEnabled?: boolean;
  isCentralCartRcEnabled?: boolean;
  [key: string]: any;
}

export function setDefaultAddress(
  response: UserProfileResponse,
): (UserProfileResponse & { success: boolean }) | { status: boolean; message: string } {
  safeDebug(
    Logger,
    () =>
      `Set Default Address API → transform: setDefaultAddress → raw response: ${JSON.stringify(
        response,
      )}`,
  );

  try {
    if (response && response.id) {
      return {
        success: true,
        ...response,
      };
    }

    return {
      status: false,
      message: 'Failed to set default address',
    };
  } catch (error) {
    return {
      status: false,
      message:
        (error as Error)?.message ||
        'Exception while transforming Set Default Address API response',
    };
  }
}
