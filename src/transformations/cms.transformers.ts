/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { CMS_ASSETS_URLS } from 'src/config/app.config';
import * as qs from 'qs';
import { BaseRequest } from 'src/models/base-request.model';

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

export function homeBlogs(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
    body: null,
  };

  const blogParams = {
    sort: ['customDate:desc', 'updatedAt:desc'],
    populate: {
      fields: ['title', 'categoryName', 'linkUrl'],
      thumbnail: {
        fields: ['url', 'alternativeText', 'name'],
      },
    },
    pagination: {
      pageSize: 5,
      page: 1,
    },
  };

  transformedRequest.url.search = qs.stringify(blogParams);

  return transformedRequest;
}
