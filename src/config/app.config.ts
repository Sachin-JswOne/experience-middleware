import * as dotenv from 'dotenv';
dotenv.config();

export const APP_ENV = process.env.APP_ENV || 'dev';
export const JWT_SECRET = process.env.JWT_SECRET;

// Below line is Getting imported in tranformer.
export const CMS_MSME_URL = process.env.CMS_MSME_URL;
export const CMS_ASSETS_URLS = {
  BUCKET_URL: process.env.CMS_ASSETS_BUCKET_URL || 'https://default-bucket-url.com',
  CDN_URL: process.env.CMS_ASSETS_CDN_URL || 'https://default-cdn-url.com',
};

export const PRODUCT_TYPE_KEYS = {
  TMT: 'steel_TMT',
  Cement: 'cement',
  'MS Hot Rolled Sheets': 'steel_hr_sheets',
  'MS Hot Rolled Coils': 'steel_hr_coil',
  'HRPO Sheets': 'steel_hr_sheets',
  'HRPO Coils': 'steel_hr_coil',
  'MS Cold Rolled Sheets': 'steel_cr_sheets',
  'MS Cold Rolled Coils': 'steel_cr_coil',
  'PPGL Coils': 'steel_ppgl_coil',
  'PPGL Sheets': 'steel_ppgl_sheets',
  'GL Coils': 'steel_gl_coil',
  'GL Sheets': 'steel_gl_sheets',
  'GI Coils': 'steel_gi_coil',
  'GI Sheets': 'steel_gi_sheets',
  'Wire Rod Coils': 'steel_wr_coil',
  'SS Hot Rolled Coils': 'stainless_steel_hot_rolled_coil',
  'SS Hot Rolled Sheets': 'stainless_steel_hot_rolled_sheets',
  'SS Cold Rolled Coils': 'stainless_steel_cold_rolled_coil',
  'SS Cold Rolled Sheets': 'stainless_steel_cold_rolled_sheets',
  Angles: 'steel_angles',
  Channels: 'steel_channels',
  'Beams and Columns': 'steel_beams',
  'Bituminous Emulsion': 'bulk_bitumen',
  'Viscosity Grade Bitumen': 'bitumen',
};

export const CCP_PRICE_API_ATTRIBUTES_MAPPING = {
  thickness: 'THICKNESS_MM',
  length: 'LENGTH_MM',
  width: 'WIDTH_MM',
  coating_grade_gsm_gi: 'S_ZN_COATING_GSM_MIN',
  coating_grade_gsm_gl_ppgl: 'S_AL_ZN_COATING_GSM_MIN',
  spangle_type: 'SPANGLE_TYPE',
  colour: 'S_COLOUR_CODE_TOP',
  diameter: 'DIAMETER_MM',
  leg: 'LEG1_MM',
  flange_width: 'FLANGE_WIDTH_MM',
  web_depth: 'WEB_DEPTH_MM',
  sectional_weight: 'SECTIONAL_WEIGHT_KG_PER_M',
  DIAMETER_MM: 'DIAMETER_MM',
  FORM: 'TMT_FORM',
};

export const SHIPMENT_STATUS = {
  Invoiced: 'Delivered',
  Completed: 'Delivered',
  Dispatched: 'Dispatched',
  Delivered: 'Delivered',
};

export const ORDER_TAG = 'Fulfilled by JSW One';

export const DEFAULT_CURRENCY_CODE = 'INR';

export const MSME = 'msme';

export const MSME_ERRORS_MAPPING = {
  'Incorrect OTP. Please enter correct OTP': 'Incorrect OTP. Please enter a valid OTP',
  'Wrong password. Please try again with the correct password':
    'Incorrect password. Please try again',
  'You have exceeded maximum limit. Please retry after 24 hrs or contact our sales team: 7208055523 or support@jswonemsme.com':
    'Max retry limit reached. Please try after 24 hrs.',
  'You have exceeded maximum limit. Please try re-generating the otp.':
    'Max retry limit reached. Please try after 24 hrs.',
  'Otp has expired, Please regenerate otp to continue.':
    'OTP has expired. Please resend OTP to continue.',
  'Otp is not for this customer': 'Something went wrong. Please try again later.',
};
export const SF_QUERY_PARAMS = {
  grant_type: process.env.SF_GRANT_TYPE,
  client_id: process.env.SF_CLIENT_ID,
  client_secret: process.env.SF_CLIENT_SECRET,
  username: process.env.SF_USERNAME,
  password: process.env.SF_PASSWORD,
};

export const TIMEOUTS = {
  REQUEST: Number(process.env.REQUEST_TIMEOUT) || 5000,
  REQUEST_MIN: Number(process.env.REQUEST_TIMEOUT_MIN) || 3000,
  SOCKET: Number(process.env.SOCKET_TIMEOUT) || 1000,
};

export const GUEST = 'guest';
export const GUEST_USER_STATE = 'G';

export const ERP_ORDER_TYPE_MAPPING = {
  PRIVATE_BRAND: 'PRIVATE BRAND',
  MSME: 'MSME',
};

export const ERP_SHIP_TO_TYPE_MAPPING = {
  SECONDARY: 'secondary',
};

export const ERP_ORDER_STATUS = {
  Placed: 'Placed',
  Created: 'Created',
  Order_Created: 'Order_Created',
};

export const ERP_ORDER_STATUS_MAPPING = {
  Placed: 'Awaiting payment',
  Created: 'Awaiting payment',
  Confirmed: 'Order confirmed',
  'Delivery in progress': 'Delivery in progress',
  Delivered: 'Order delivered',
  Cancelled: 'Order cancelled',
  Closed: 'Order delivered',
  Order_Created: 'Order created',
};

export const ORDER_LIST_UOM_MAPPING = {
  'No. of bags': 'Bags',
};

export const UOM = {
  MT: 'mt',
  Bags: 'bags',
  NUMBER_OF_BAGS: 'bags',
  'No. of bags': 'Number of bags',
  NUMBER_OF_SHEETS: 'MT',
  kg: 'kg',
  colour: 'colour',
  GSM: 'GSM',
};

export const APP_STATUS_FOR_MSME = {
  new: 'Awaiting confirmation',
  'awaiting pricing': 'Awaiting confirmation',
  'awaiting customer approval': 'Awaiting confirmation',
  'awaiting document': 'Awaiting confirmation',
  'awaiting pi': 'Awaiting confirmation',
  'awaiting payment': 'Awaiting confirmation',
  lost: 'Order cancelled',
};

export const CONNECTOR_ORDER_TYPE_MAPPING = {
  PRIVATE_BRAND: 'Private Brand',
};

export const APP_STATUS_PB_WHEN_NO_FULLFILLEDBY_PRESENT = {
  new: 'Awaiting confirmation',
  rejected: 'Awaiting confirmation',
  lost: 'Order cancelled',
};

export const APP_STATUS_PB_WHEN__FULLFILLEDBY_JSW_ONE = {
  new: 'Awaiting confirmation',
  quoted: 'Awaiting confirmation',
  'awaiting approval from jsw one': 'Awaiting confirmation',
  'awaiting customer approval': 'Awaiting confirmation',
  'awaiting credit approval from jsw one': 'Awaiting confirmation',
  rejected: 'Order cancelled',
  lost: 'Order cancelled',
};

export const APP_STATUS_PB_WHEN__FULLFILLEDBY_JSW_ONE_DISTRIBUTOR = {
  new: 'Awaiting confirmation',
  quoted: 'Order confirmed',
  success: 'Order delivered',
  lost: 'Order cancelled',
};

export const PB_ORDER_TAGS = {
  'JSW One': 'Fulfilled by JSW One',
  Warehouse: 'Fulfilled by JSW One Distributor',
};

export const PAYMENT_STATUS_MAPPING = {
  Full: 'Paid',
  Pending: 'Pending',
  Partial: 'Partial',
};

export const DEFAULT_VALUE = 0.0;
export const CONSENT_EVENT_NAME = 'opt-in';
export const CONSENT_REGISTRATION_SOURCE = 'JSW One MSME App';

export const DEFAULT_OFFSET = 0;
export const DEFAULT_PAGE_SIZE = 20;

export const CT_ATTRIBUTES_MAPPING = {
  thickness: 'THICKNESS_MM',
  width: 'WIDTH_MM',
  length: 'LENGTH_MM',
  coating_grade_gsm_gi: 'S_ZN_COATING_GSM_MIN',
  coating_grade_gsm_gl_ppgl: 'S_AL_ZN_COATING_GSM_MIN',
  spangle_type: 'SPANGLE_TYPE',
  colour: 'S_COLOUR_CODE_TOP',
  diameter: 'DIAMETER_MM',
  leg: 'LEG1_MM',
  flange_width: 'FLANGE_WIDTH_MM',
  web_depth: 'WEB_DEPTH_MM',
  sectional_weight: 'SECTIONAL_WEIGHT_KG_PER_M',
  form: 'TMT_FORM',
};

export const PRODUCT_TYPES = {
  cement_bitumen: 'Cement/Bitumen',
  tmt_pb_tmt: 'TMT/PB TMT',
  ms_ss_hr_cr_coils: 'MS and SS HR/CR Coils',
  ms_ss_hr_cr_sheets: 'MS and SS HR/CR Sheets',
  gi_coils: 'GI Coils',
  gi_sheets: 'GI Sheets',
  gl_coils: 'GL Coils',
  gl_sheets: 'GL Sheets',
  ppgl_coils: 'PPGL Coils',
  ppgl_sheets: 'PPGL Sheets',
  wire_rod_coils: 'Wire Rod Coils',
  ss_hot_rolled_coils: 'SS Hot Rolled Coils',
  ss_hot_rolled_sheets: 'SS Hot Rolled Sheets',
  ss_cold_rolled_coils: 'SS Cold Rolled Coils',
  ss_cold_rolled_sheets: 'SS Cold Rolled Sheets',
  angles: 'Angles',
  channels_beams_and_columns: 'Channels, Beams and Columns',
  default: 'Others',
};

export const UOM_LIST = {
  MT: 'MT',
  bags: 'Bags',
  KG: 'Kg',
  sheets: 'Sheets',
};

export const KEY_AND_DISPLAY_NAME_MAPPING = {
  DIAMETER_MM: { displayName: 'Diameter', key: 'DIAMETER_MM' },
  TMT_FORM: { displayName: 'Form', key: 'FORM' },
  thickness: { displayName: 'Thickness', key: 'thickness' },
  width: { displayName: 'Width', key: 'width' },
  length: { displayName: 'Length', key: 'length' },
  coating_grade: { displayName: 'Coating grade', key: 'coating_grade_gsm' },
  spangle_type: { displayName: 'Spangle type', key: 'spangle_type' },
  colour: { displayName: 'Colour', key: 'colour' },
  diameter: { displayName: 'Diameter', key: 'diameter' },
  leg: { displayName: 'Leg length', key: 'leg' },
  web_depth: { displayName: 'Web depth', key: 'web_depth' },
  flange_width: { displayName: 'Flange width', key: 'flange_width' },
  sectional_weight: { displayName: 'Sectional weight', key: 'sectional_weight' },
};

export const country = 'IN';

export const USER_TYPE = 'R';
