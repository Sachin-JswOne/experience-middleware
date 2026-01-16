import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';
import { CMS_MSME_URL } from 'src/config/app.config';
import * as generalTransformers from './general.transformers';
import * as qs from 'qs';

// Responsible for extracting the category ids from provided array of objects
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

// This is responsible for selecting the strapi url based on the device type for buy-online footer section
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

// This is responsible for creating the request for central catalogue API based on the strapi response for desktop
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

// This is responsible for merging the strapi and cca responses for buy-online footer section Desktop
export function mergeCategoryResponses(results: AggregatedResponse[]): any {
  const strapiResult = results.find((r) => r.target === 'strapi-footer');
  const ccaResult = results.find((r) => r.target === 'cca-categories');
  const isMobile = strapiResult?.data?.data?.footer !== undefined;
  const device = isMobile ? 'mobile' : 'desktop';
  const featureFlagResult = results.find((r) => r.target === 'cmsFeatureFlag');
  const featureFlags = featureFlagResult?.success ? featureFlagResult.data.data : [];
  // Find the specific flag for 'central_catalogue_global'

  const centralCatalogueFlag = featureFlags.find(
    (flag: any) => flag?.name === 'central_catalogue_global',
  );

  const isCentralCatalogueEnabled = centralCatalogueFlag?.isActive === true;

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
            (menu: any) => menu?.name?.toLowerCase() === link?.label?.toLowerCase(),
          );
          return isCentralCatalogueEnabled && match?.name && match?.seoUrl
            ? { ...link, label: match.name, url: match.seoUrl }
            : link;
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
            (menu: any) => menu?.name?.toLowerCase() === link?.linkText?.toLowerCase(),
          );
          return isCentralCatalogueEnabled && match?.name && match?.seoUrl
            ? { ...link, linkText: match.name, linkHref: match.seoUrl }
            : link;
        });
      }
    }

    return desktopFooter;
  }
}

// This is responsible for creating the request for central catalogue API based on the strapi response for mobile mweb
export function transformWebGlobalCcaRequest(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
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
        (section: any) => section.heading === 'Buy online',
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

  return {
    ...request,
    body: {
      categoryIds: ids,
    },
  };
}

// This is responsible for merging the strapi and cca responses for buy-online footer section Mobile mweb
export function mergeWebGlobalResponse(results: AggregatedResponse[]): any {
  const strapiResult = results.find((r) => r.target === 'webGlobalPage');
  const ccaResult = results.find((r) => r.target === 'cca-categories');

  const featureFlagResult = results.find((r) => r.target === 'cmsFeatureFlag');
  const featureFlags = featureFlagResult?.success ? featureFlagResult.data.data : [];
  // Find the specific flag for 'central_catalogue_global'
  const centralCatalogueFlag = featureFlags.find(
    (flag: any) => flag?.name === 'central_catalogue_global',
  );
  const isCentralCatalogueEnabled = centralCatalogueFlag?.isActive === true;
  if (!strapiResult || !strapiResult.success) {
    return { error: 'Strapi fetch failed' };
  }
  // If CCA failed or has no data, return Strapi data as is (fallback)
  if (!ccaResult || !ccaResult.success) {
    console.warn('CCA fetch failed, returning original Strapi data');
    return strapiResult.data;
  }
  const appGlobalData = strapiResult.data; // This is the full response object
  const ccaSubMenus = ccaResult?.data?.data?.navigation?.[0]?.subMenu || [];
  try {
    const footerData = appGlobalData?.data?.footer || [];
    const globalFooter = footerData.find(
      (item: any) => item?.__component === 'global.global-footer',
    );
    if (globalFooter && globalFooter.footerSections) {
      const buyOnlineSection = globalFooter.footerSections.find(
        (s: any) => s?.heading === 'Buy online',
      );
      if (buyOnlineSection?.links) {
        // Update the links with data from CCA
        buyOnlineSection.links = buyOnlineSection.links.map((link: any) => {
          const match = ccaSubMenus.find(
            (menu: any) => menu?.name?.toLowerCase() === link?.label?.toLowerCase(),
          );
          return isCentralCatalogueEnabled && match?.name && match?.seoUrl
            ? { ...link, label: match.name, url: match.seoUrl }
            : link;
        });
      }
    }
  } catch (error) {
    Logger.error('Error merging web-global response:', error);
    return appGlobalData;
  }
  return appGlobalData;
}

// This is responsible for adding the feature flag query params to the request
export function addFeatureFlagQueryParams(request: BaseRequest): BaseRequest {
  const transformedRequest: BaseRequest = {
    ...request,
    body: null, // Clear body as it is not needed for GET request
  };
  const featureFlagQuery = {
    filters: {
      isActive: {
        $eq: true,
      },
    },
    pagination: {
      pageSize: 100,
      page: 1,
    },
  };
  transformedRequest.url.search = qs.stringify(featureFlagQuery);
  return transformedRequest;
}

// This is responsible for creating the request for central catalogue API based on the strapi response for main menu
export function transformMainMenuCcaRequest(
  request: BaseRequest,
  prevResponses: AggregatedResponse[],
): BaseRequest {
  const strapiResponse = prevResponses.find((r) => r.target === 'header-main-menu');
  if (!strapiResponse || !strapiResponse.success) {
    Logger.error(`Error: transformMainMenuCcaRequest Strapi dependency failed`);
    return request;
  }
  let navigationItems: any[] = [];
  const strapiData = strapiResponse?.data?.data || strapiResponse?.data || [];

  if (Array.isArray(strapiData)) {
    navigationItems = strapiData[0].central_catalogue_navigations;
  }
  const ids = extractIds(navigationItems).filter(Boolean);

  return {
    ...request,
    body: {
      categoryIds: ids,
    },
  };
}

// This is responsible for merging the strapi and cca responses for main menu
export function mergeMainMenuResponses(results: AggregatedResponse[]): any {
  const strapiResult = results.find((r) => r.target === 'header-main-menu');
  const ccaResult = results.find((r) => r.target === 'cca-header-categories');
  const featureFlagResult = results.find((r) => r.target === 'cmsFeatureFlag');

  const featureFlags = featureFlagResult?.success ? featureFlagResult.data.data : [];
  const centralCatalogueFlag = featureFlags.find(
    (flag: any) => flag?.name === 'central_catalogue_global',
  );
  const isCentralCatalogueEnabled = centralCatalogueFlag?.isActive === true;

  // if strapi is not able to fetch data then return error
  if (!strapiResult || !strapiResult.success) {
    return { error: 'Strapi fetch failed' };
  }
  const strapiMainMenuData = strapiResult?.data?.data || strapiResult?.data || [];

  // if feature flag is not enabled or cca is not able to fetch data then return strapi data
  if (!isCentralCatalogueEnabled || !ccaResult || !ccaResult.success) {
    return strapiMainMenuData[0].navigation;
  }
  const mainMenuNavigationStrapi = strapiMainMenuData[0].navigation;
  const ccaNavigation = ccaResult?.data?.data?.navigation[0]?.subMenu || [];

  // taking the blogs and offers from strapi and adding it to ccaNavigation
  mainMenuNavigationStrapi.forEach((item) => {
    if (item?.name.toLowerCase() === 'blogs' || item?.name.toLowerCase() === 'offers') {
      ccaNavigation.push(item);
    }
  });

  return ccaNavigation;
}
