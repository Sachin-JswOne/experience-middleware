import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';
import { AxiosResponse } from 'axios';

interface SearchPageCmsData {
  title?: string;
  blocks?: CmsBlock[];
  [key: string]: any;
}

interface SearchPageResponse {
  data?: SearchPageCmsData;
  success?: boolean;
}
interface CmsBlock {
  __component: string;
  [key: string]: any;
}

export function getSearchPageDetails(
  response: AxiosResponse<SearchPageResponse>,
): any {
  safeDebug(
    Logger,
    () =>
      `Search Page API → transform: getSearchPageDetails → raw response: ${JSON.stringify(
        response.data,
      )}`,
  );

  try {
    const payload = response.data;

    if (!payload?.data) {
      Logger.error('Search Page Transformer: Missing CMS data');
      return {
        data: {},
        meta: {},
        success: false,
        error: 'Invalid CMS response',
        httpStatus: response.status,
      };
    }

    const cmsData: SearchPageCmsData = payload.data;

    // Extract blocks
    const blocks: CmsBlock[] = Array.isArray(cmsData.blocks)
      ? [...cmsData.blocks]
      : [];
    const transformed = {
      data: {
        ...cmsData,
        blocks,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };

    return transformed;
  } catch (error) {
    Logger.error(
      `Search Page Transformer: Error transforming data → ${(error as Error)?.message}`,
    );

    return {
      success: false,
      error: 'Failed to transform Search Page response',
      exception: (error as Error)?.message,
      httpStatus: response.status,
    };
  }
}
