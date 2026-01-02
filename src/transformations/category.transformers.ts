import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';
import { CMS_MSME_URL } from 'src/config/app.config';
import * as generalTransformers from './general.transformers';

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

export function selectStrapiUrl(request: BaseRequest): BaseRequest {
  // Parse query params from the URL search string

  // Add defensive check
  if (!request) {
    Logger.error('selectStrapiUrl: request is undefined');
    throw new Error('Request object is undefined');
  }

  if (!request.url) {
    Logger.error('selectStrapiUrl: request.url is undefined', JSON.stringify(request));
    throw new Error('Request URL is undefined');
  }
  const device = request.body?.device || 'desktop';

  let targetUrl: string;
  if (device === 'mobile') {
    targetUrl = `${CMS_MSME_URL}/app-global`;
  } else {
    targetUrl = `${CMS_MSME_URL}/jsw-footer-navigations`;
  }
  // Create a new URL object with the target URL
  const newUrl = new URL(targetUrl);
  // Create the transformed request with the new URL
  const transformedRequest: BaseRequest = {
    ...request,
    url: newUrl,
  };
  // Now apply moveBodyToQueryParams to handle any query params
  return generalTransformers.moveBodyToQueryParams(transformedRequest);
}

export function transformCcaRequest(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  const strapiResponse = prevResponses.find((r) => r.target === 'strapi-footer');
  // Get device type from original request
  const isMobile = strapiResponse?.data?.data?.footer !== undefined;
  const device = isMobile ? 'mobile' : 'desktop';

  safeDebug(
    Logger,
    () => ` Strapi Response from method: transformCcaRequest : ${JSON.stringify(strapiResponse)}`,
  );

  if (!strapiResponse || !strapiResponse.success) {
    Logger.error(`Error for Category API method: transformCcaRequest Strapi dependency failed`);
  }

  let navigationItems: any[] = [];

  if (device === 'mobile') {
    // Extract from mobile footer structure (global-footer)
    const mobileData = strapiResponse?.data.data.footer[0] || {};
    if (mobileData.footerSections) {
      const buyOnlineSection = mobileData.footerSections.find(
        (section: any) => section.heading === 'Buy online',
      );
      if (buyOnlineSection?.central_catalogue_navigations) {
        navigationItems = buyOnlineSection.central_catalogue_navigations;
      }
    }
  } else {
    // Extract from desktop footer structure (jsw-footer-navigations)
    const strapiData = strapiResponse?.data?.data || strapiResponse?.data || [];

    if (
      Array.isArray(strapiData) &&
      strapiData.length > 0 &&
      strapiData[0]?.menuItems?.length > 0
    ) {
      const buyOnlineMenu = strapiData[0].menuItems.find(
        (item: any) => item.sectionTitle === 'Buy online',
      );
      navigationItems = buyOnlineMenu?.central_catalogue_navigations || [];
    } else {
      Logger.error(
        `Error for Strapi desktop footer API: menuItems are not found in stapir response`,
      );
    }
  }
  const ids = extractIds(navigationItems).filter(Boolean);

  safeDebug(
    Logger,
    () => ` Extracted IDs from method: transformCcaRequest (${device}): ${JSON.stringify(ids)}`,
  );
  return {
    ...request,
    body: {
      categoryIds: ids,
    },
  };
}

export function mergeCategoryResponses(
  results: AggregatedResponse[],
  // originalRequest: BaseRequest,
): any {
  const strapiResult = results.find((r) => r.target === 'strapi-footer');
  const ccaResult = results.find((r) => r.target === 'cca-categories');
  // const device = originalRequest?.headers?.['x-device-type'] || 'desktop';
  const isMobile = strapiResult?.data?.data?.footer !== undefined;
  const device = isMobile ? 'mobile' : 'desktop';

  // ... existing error handling ...
  const ccaSubMenus = ccaResult?.data?.data?.navigation[0]?.subMenu || [];
  if (device === 'mobile') {
    // Process mobile footer (global-footer structure)
    const mobileFooter = strapiResult?.data.data.footer[0] || {};

    if (mobileFooter.footerSections) {
      const buyOnlineSection = mobileFooter.footerSections.find(
        (s: any) => s.heading === 'Buy online',
      );
      if (buyOnlineSection?.links) {
        buyOnlineSection.links = buyOnlineSection.links.map((link: any) => {
          const match = ccaSubMenus.find(
            (menu: any) => menu.name.toLowerCase() === link.label.toLowerCase(),
          );
          return match ? { ...link, label: match.name, url: match.seoUrl } : link;
        });
      }
    }

    return mobileFooter;
  } else {
    // Process desktop footer (existing jsw-footer-navigations structure)
    const desktopFooter = strapiResult?.data?.data || [];
    if (Array.isArray(desktopFooter) && desktopFooter.length > 0) {
      const buyOnlineMenu = desktopFooter[0].menuItems.find(
        (item: any) => item.sectionTitle === 'Buy online',
      );

      if (buyOnlineMenu?.tertiaryLinks) {
        buyOnlineMenu.tertiaryLinks = buyOnlineMenu.tertiaryLinks.map((link: any) => {
          const match = ccaSubMenus.find(
            (menu: any) => menu.name.toLowerCase() === link.linkText.toLowerCase(),
          );
          return match ? { ...link, linkText: match.name, linkHref: match.seoUrl } : link;
        });
      }
    }

    return desktopFooter;
  }
}

export function transformWebGlobalCcaRequest(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  console.log('transformWebGlobalCcaRequest called');

  // 1. Get the Strapi response
  const strapiResponse = prevResponses.find((r) => r.target === 'webGlobalPage');
  if (!strapiResponse || !strapiResponse.success) {
    Logger.error('Error: transformWebGlobalCcaRequest - Strapi dependency failed');
    return request;
  }
  // 2. Extract the ID from the "Buy online" section
  let ids: string[] = [];
  try {
    const footerData = strapiResponse.data?.data?.footer || [];
    // Find the global-footer component
    const globalFooter = footerData.find(
      (item: any) => item.__component === 'global.global-footer',
    );
    if (globalFooter && globalFooter.footerSections) {
      const buyOnlineSection = globalFooter.footerSections.find(
        (section: any) => section.heading === 'Buy online'
      );
      if (buyOnlineSection?.central_catalogue_navigations) {
        // Extract IDs using your key logic (assuming array of objects with id or similar)
        // Adjust 'categoryId' based on actual Strapi response structure
        ids = extractIds(buyOnlineSection.central_catalogue_navigations).filter(Boolean);
      }
    }
  } catch (err) {
    Logger.error('Error extracting IDs from web-global response:', err);
  }
  safeDebug(Logger, () => `Extracted IDs for Web Global: ${JSON.stringify(ids)}`);
  // 3. Return the CCA Request
  console.log('transformWebGlobalCcaRequest', {
    ...request,
    body: {
      categoryIds: ids,
    },
  });
  return {
    ...request,
    body: {
      categoryIds: ids,
    },
  };
}

export function mergeWebGlobalResponse(results: AggregatedResponse[]): any {
  console.log('mergeWebGlobalResponse called');
  const strapiResult = results.find((r) => r.target === 'webGlobalPage');
  const ccaResult = results.find((r) => r.target === 'cca-categories');
  if (!strapiResult || !strapiResult.success) {
    return { error: 'Strapi fetch failed' };
  }
  // If CCA failed or has no data, return Strapi data as is (fallback)
  if (!ccaResult || !ccaResult.success) {
    console.warn('CCA fetch failed, returning original Strapi data');
    return strapiResult.data;
  }
  const appGlobalData = strapiResult.data; // This is the full response object
  const ccaSubMenus = ccaResult.data?.data?.navigation?.[0]?.subMenu || [];
  try {
    const footerData = appGlobalData.data?.footer || [];
    const globalFooter = footerData.find((item: any) => item.__component === 'global.global-footer');
    if (globalFooter && globalFooter.footerSections) {
      const buyOnlineSection = globalFooter.footerSections.find(
        (s: any) => s.heading === 'Buy online'
      );
      if (buyOnlineSection?.links) {
        // Update the links with data from CCA
        buyOnlineSection.links = buyOnlineSection.links.map((link: any) => {
          const match = ccaSubMenus.find(
            (menu: any) => menu.name?.toLowerCase() === link.label?.toLowerCase()
          );
          return match
            ? { ...link, label: match.name, url: match.seoUrl }
            : link;
        });
      }
    }
  } catch (error) {
    Logger.error('Error merging web-global response:', error);
  }
  return appGlobalData;
}
