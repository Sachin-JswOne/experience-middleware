import * as dotenv from 'dotenv';
dotenv.config();

export const APP_ENV = process.env.APP_ENV || 'dev';

export const CMS_ASSETS_URLS = {
  BUCKET_URL:
    process.env.CMS_ASSETS_BUCKET_URL || 'https://default-bucket-url.com',
  CDN_URL: process.env.CMS_ASSETS_CDN_URL || 'https://default-cdn-url.com',
};
