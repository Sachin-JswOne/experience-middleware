/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';

function extractMMIDs(items: any[]): string[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => item?.MMID)
    .filter((mmid): mmid is string => typeof mmid === 'string' && mmid.length > 0);
}

export function transformTopItemsMMIDRequest(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  const cmsResponse = prevResponses.find((r) => r.target === 'app-search-page');

  safeDebug(Logger, () => `Strapi Search Page Response → ${JSON.stringify(cmsResponse?.data)}`);

  let mmids: string[] = [];

  try {
    const blocks = cmsResponse?.data?.data?.blocks ?? [];

    const topItemsBlock = blocks.find(
      (b) => b.__component === 'app-components.app-search-top-items',
    );

    if (topItemsBlock?.app_search_top_items) {
      mmids = extractMMIDs(topItemsBlock.app_search_top_items);
    }
  } catch (error) {
    Logger.warn(`transformTopItemsMMIDRequest: MMID extraction failed → ${error}`);
  }

  // Remove duplicates
  mmids = Array.from(new Set(mmids));
  safeDebug(Logger, () => `Final MMIDs sent to CCP → ${JSON.stringify(mmids)}`);

  safeDebug(
    Logger,
    () =>
      `CCP Request Payload →
    type: ${Array.isArray(mmids) ? 'Array' : typeof mmids},
    length: ${mmids.length},
    body: ${JSON.stringify(mmids)}`,
  );
  // IMPORTANT: CCP expects RAW ARRAY
  return {
    ...request,
    body: mmids,
  };
}

export function pickCcpResponse(responses: AggregatedResponse[]) {
  const ccpResponse = responses.find((r) => r.target === 'ccp-top-items-product-details');
  Logger.log(`Strapi Search Page Response → ${JSON.stringify(ccpResponse)}`);
  return ccpResponse?.data ?? {};
}
