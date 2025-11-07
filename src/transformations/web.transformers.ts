/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { getFormattedTracingContext } from 'src/utils/tracing.util';

export function mergeWebHomePageResponses(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const cmsResponse = responses['app-home-page'];
  const blogsResponse = responses['app-blogs'];

  if (
    !cmsResponse ||
    !cmsResponse.success ||
    typeof cmsResponse.data !== 'object' ||
    cmsResponse.data === null
  ) {
    Logger.error(
      `Error for Web Home Page API method: mergeWebHomePageResponses ${getFormattedTracingContext()} CMS response is missing or invalid.`,
    );
    return { data: {}, meta: {} };
  }

  // Clone CMS data as base structure
  const mergedData: Record<string, unknown> = {
    ...cmsResponse.data.data,
  };

  // Extract blocks from CMS
  const cmsData = cmsResponse.data.data as {
    blocks?: any[];
  };

  const blocks: any[] = Array.isArray(cmsData?.blocks)
    ? [...cmsData.blocks]
    : [];

  // Inject blogs
  const blogs = blogsResponse?.data?.data || [];
  const blogsBlock = blocks.find(
    (block: any) =>
      block.type === 'blogs' ||
      block.__component === 'app-components.app-blog-list-component',
  );
  if (blogsBlock) {
    blogsBlock.blogs = blogs;
  }

  // Update merged data with blocks
  mergedData.blocks = blocks;

  return {
    data: mergedData,
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };
}
