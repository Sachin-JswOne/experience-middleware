/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';

function extractIds(items: any[]): string[] {
  const ids: string[] = [];
  if (!Array.isArray(items)) return ids;

  for (const item of items) {
    if (item.categoryId) {
      ids.push(String(item.categoryId));
    }
  }
  return ids;
}

export function transformCcaRequest(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  const strapiResponse = prevResponses.find(
    (r) => r.target === 'strapi-categories',
  );

  safeDebug(
    Logger,
    () =>
      ` Strapi Response from method: transformCcaRequest : ${JSON.stringify(
        strapiResponse,
      )}`,
  );

  if (!strapiResponse || !strapiResponse.success) {
    Logger.error(
      `Error for Category API method: transformCcaRequest Strapi dependency failed`,
    );
  }

  const strapiData = strapiResponse?.data?.data || strapiResponse?.data || [];
  let navigationItems: any[] = [];

  // Assuming the structure is data[0].central_catalogue_navigations
  // Check for the new field first, then fallback to others if needed
  if (
    Array.isArray(strapiData) &&
    strapiData.length > 0 &&
    strapiData[0]?.menuItems.length > 0
  ) {
    const buyOnlineMenu = strapiData[0].menuItems.find(
      (item: any) => item.sectionTitle === 'Buy online',
    );
    navigationItems = buyOnlineMenu?.central_catalogue_navigations;
  } else if (
    Array.isArray(strapiData) &&
    strapiData.length > 0 &&
    strapiData[0]?.navigation
  ) {
    // Fallback to 'navigation' if 'centralCatalogueNavigation' is missing
    navigationItems = strapiData[0].navigation;
  } else if (Array.isArray(strapiData)) {
    navigationItems = strapiData;
  }

  const ids = extractIds(navigationItems).filter(Boolean);

  safeDebug(
    Logger,
    () =>
      ` Extracted IDs from method: transformCcaRequest : ${JSON.stringify(
        ids,
      )}`,
  );
  return {
    ...request,
    body: {
      categoryIds: ids,
    },
  };
}

export function mergeCategoryResponses(results: AggregatedResponse[]): any {
  const strapiResult = results.find((r) => r.target === 'strapi-categories');
  const ccaResult = results.find((r) => r.target === 'cca-categories');

  safeDebug(
    Logger,
    () =>
      ` Strapi Result from method: mergeCategoryResponses : ${JSON.stringify(
        strapiResult,
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      ` CCA Result from method: mergeCategoryResponses : ${JSON.stringify(
        ccaResult,
      )}`,
  );

  if (!strapiResult?.success) {
    Logger.error(
      `Error for Category API method: mergeCategoryResponses Strapi categories fetch failed: ${JSON.stringify(strapiResult?.error)}`,
    );
    return strapiResult?.error || { error: 'Strapi categories fetch failed' };
  }
  const ccaSubMenus = ccaResult?.data.data.navigation[0].subMenu;
  const buyOnlineMenu = strapiResult.data.data[0].menuItems.find(
    (item: any) => item.sectionTitle === 'Buy online',
  );
  buyOnlineMenu.tertiaryLinks = buyOnlineMenu.tertiaryLinks.map((link) => {
    const match = ccaSubMenus.find((menu) => menu.name === link.linkText);
    if (!match) return link || {};

    return {
      ...link,
      linkText: match.name,
      linkHref: match.seoUrl,
    };
  });

  return strapiResult.data.data;
}
