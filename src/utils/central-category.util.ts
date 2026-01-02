import { Logger } from '@nestjs/common';
import { BaseRequest } from '../models/base-request.model';
import { AggregatedResponse } from '../models/aggregated-response.model';

/**
 * Extracts all central catalogue category IDs from all blocks that contain them.
 */
export function getAllCentralCatalogueCategoryIds(blocks: any[]): string[] {
    const categoryIds = blocks
        .filter((b: any) => Array.isArray(b.web_central_catalogue_categories))
        .flatMap((b: any) => b.web_central_catalogue_categories.map((c: any) => c.categoryId))
        .filter(Boolean);

    // Return unique IDs
    return [...new Set(categoryIds)];
}

/**
 * Extracts central catalogue category IDs from the CMS home page response.
 * This is used to fetch navigation data for categories.
 */
export function extractCentralCatalogueCategoryIds(
    request: BaseRequest,
    prevResponses?: AggregatedResponse[],
): BaseRequest {
    if (!prevResponses || prevResponses.length === 0) {
        Logger.warn(`No previous responses available`);
        return request;
    }

    const cmsResponse = prevResponses.find(
        (r) => r.target === 'app-home-page',
    );

    if (!cmsResponse?.success) {
        Logger.warn(`CMS response missing or failed`);
        return request;
    }

    const blocks = cmsResponse.data?.data?.blocks ?? [];
    const categoryIds = getAllCentralCatalogueCategoryIds(blocks);

    if (categoryIds.length === 0) {
        Logger.warn(`No central catalogue category IDs found in any blocks`);
        return request;
    }

    return {
        ...request,
        body: {
            categoryIds,
        },
    };
}
