/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { CMS_ASSETS_URLS } from 'src/config/app.config';

/* eslint-disable @typescript-eslint/no-unsafe-return */
export function replaceUriPrefix(response: any): any {
  if (Array.isArray(response)) {
    return response.map((item) => replaceUriPrefix(item));
  } else if (response && typeof response === 'object') {
    const newResponse: Record<string, any> = {};
    for (const key in response) {
      if (
        key === 'url' &&
        typeof response[key] === 'string' &&
        response[key].startsWith(CMS_ASSETS_URLS.BUCKET_URL)
      ) {
        newResponse[key] = response[key].replace(
          CMS_ASSETS_URLS.BUCKET_URL,
          CMS_ASSETS_URLS.CDN_URL,
        );
      } else {
        newResponse[key] = replaceUriPrefix(response[key]);
      }
    }
    return newResponse;
  }
  return response;
}
