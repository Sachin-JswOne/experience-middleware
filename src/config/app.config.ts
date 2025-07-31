import * as dotenv from 'dotenv';
dotenv.config();

export const APP_ENV = process.env.APP_ENV || 'dev';

export const CMS_ASSETS_URLS = {
  BUCKET_URL:
    process.env.CMS_ASSETS_BUCKET_URL || 'https://default-bucket-url.com',
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
