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
      `Error for Mweb Home Page API method: mergeWebHomePageResponses ${getFormattedTracingContext()} CMS response is missing or invalid.`,
    );
    return { data: {}, meta: {} };
  }

  // Clone CMS data as base structure
  const mergedData: Record<string, unknown> = {
    ...cmsResponse.data.data,
  };

  // Extract sections or blocks from CMS
  // Handle both structures since app-home-page-v2 returns blocks
  let sections: any[] = [];
  let blocks: any[] = [];
  const cmsData = cmsResponse.data.data as {
    sections?: any[];
    blocks?: any[];
  };

  if (cmsData) {
    if (Array.isArray(cmsData.sections)) {
      sections = [...cmsData.sections];
    } else if (Array.isArray(cmsData.blocks)) {
      blocks = [...cmsData.blocks];
      sections = [...blocks]; // Use blocks as sections for injection logic
    }
  }

  // Inject blogs
  const blogs = blogsResponse?.data?.data || [];
  const blogsSection = sections.find(
    (section: any) =>
      section.type === 'blogs' ||
      section.__component === 'app-components.app-blog-list-component',
  );
  if (blogsSection) {
    blogsSection.blogs = blogs;
  }

  // Update merged data - preserve original structure (blocks or sections)
  if (blocks.length > 0) {
    mergedData.blocks = sections; // Update blocks with injected data
  } else {
    mergedData.sections = sections;
  }

  return {
    data: mergedData,
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };
}
