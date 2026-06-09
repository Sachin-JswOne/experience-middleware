import { CMS_ASSETS_URLS } from 'src/config/app.config';
import * as qs from 'qs';
import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { CustomError } from 'src/utils/CustomError';
import { moveBodyToQueryParams } from './general.transformers';

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

  const filters = request?.body?.filters?.$and || [];
  const allOrConditions = filters.flatMap((f: any) => f.$or || []);

  const industryLink = allOrConditions.find((c) => c?.industries?.link?.$eqi)?.industries?.link
    ?.$eqi;

  const industryName = allOrConditions.find((c) => c?.industries?.name?.$eqi)?.industries?.name
    ?.$eqi;

  const blogParams: Record<string, any> = {
    sort: ['customDate:desc', 'updatedAt:desc'],
    populate: {
      fields: ['title', 'categoryName', 'linkUrl'],
      thumbnail: {
        fields: ['url', 'alternativeText', 'name'],
      },
      industries: {
        fields: ['name', 'link'],
      },
    },
    pagination: {
      pageSize: 5,
      page: 1,
    },
  };
  if (industryName) {
    blogParams.filters = {
      industries: {
        name: { $eqi: industryName },
      },
    };
  } else if (industryLink) {
    blogParams.filters = {
      industries: {
        link: { $eqi: industryLink },
      },
    };
  }

  transformedRequest.url.search = qs.stringify(blogParams);

  return transformedRequest;
}

function removeEmptyArraysDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => removeEmptyArraysDeep(item));
  }

  if (value && typeof value === 'object') {
    const cleaned: Record<string, any> = {};

    for (const [key, val] of Object.entries(value)) {
      if (Array.isArray(val) && val.length === 0) {
        continue;
      }

      cleaned[key] = removeEmptyArraysDeep(val);
    }

    return cleaned;
  }

  return value;
}

export function raiseIssueTypesQueryParams(request: BaseRequest): BaseRequest {
  return moveBodyToQueryParams({
    ...request,
    body: request.body?.issueTypesQuery ?? {},
  });
}

export function raiseBrowseTopicsQueryParams(request: BaseRequest): BaseRequest {
  return moveBodyToQueryParams({
    ...request,
    body: request.body?.browseTopicsQuery ?? {},
  });
}

export function mergeRaiseIssueHelpResponse(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const issueTypesResponse = responses['raise-issue-types'];
  const browseTopicsResponse = responses['raise-browse-topics'];

  if (!issueTypesResponse?.success) {
    throw new CustomError(
      issueTypesResponse?.error || 'raise-issue-types API failed',
      issueTypesResponse?.httpStatus ?? 500,
    );
  }

  if (!browseTopicsResponse?.success) {
    throw new CustomError(
      browseTopicsResponse?.error || 'raise-browse-topics API failed',
      browseTopicsResponse?.httpStatus ?? 500,
    );
  }

  return {
    raiseIssueTypes: removeEmptyArraysDeep(issueTypesResponse.data.data ?? []),
    raiseBrowseTopics: browseTopicsResponse.data.data ?? []
  };
}
