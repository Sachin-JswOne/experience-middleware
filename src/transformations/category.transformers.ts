import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { safeDebug, safeToLog } from 'src/utils/common-functions.util';
import { CMS_MSME_URL } from 'src/config/app.config';
import { CustomError } from 'src/utils/CustomError';
import * as generalTransformers from './general.transformers';
import { moveBodyToQueryParams } from './general.transformers';
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

// This is responsible for merging the strapi and central catalogue responses for buy-online footer section Desktop
export function mergeCategoryResponses(results: AggregatedResponse[]): any {
  const strapiResult = results.find((r) => r.target === 'strapi-footer');
  const centralCatalogueResult = results.find((r) => r.target === 'cca-categories');
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
  const centralCatalogueSubMenus = centralCatalogueResult?.data?.data?.navigation[0]?.subMenu || [];
  if (device === 'mobile') {
    // Process mobile footer (global-footer structure)
    const mobileFooter = strapiResult?.data.data.footer[0] || {};
    if (mobileFooter.footerSections) {
      const buyOnlineSection = mobileFooter.footerSections.find(
        (s: any) => s.heading === 'Buy online',
      );
      if (
        !isCentralCatalogueEnabled ||
        !centralCatalogueSubMenus ||
        !centralCatalogueSubMenus.length
      ) {
        return mobileFooter;
      }
      buyOnlineSection.links = centralCatalogueSubMenus.map((item) => {
        return {
          ...item,
          label: item.name,
          url: item.slug,
        };
      });
      return mobileFooter;
    }

    return mobileFooter;
  } else {
    // Process desktop footer (existing jsw-footer-navigations structure)
    const desktopFooter = strapiResult?.data?.data || [];
    if (Array.isArray(desktopFooter) && desktopFooter.length > 0) {
      const buyOnlineMenu = desktopFooter[0].menuItems.find(
        (item: any) => item.sectionTitle === 'Buy online',
      );

      if (
        !isCentralCatalogueEnabled ||
        !centralCatalogueSubMenus ||
        !centralCatalogueSubMenus.length
      ) {
        return desktopFooter;
      }
      buyOnlineMenu.tertiaryLinks = centralCatalogueSubMenus.map((item) => {
        return {
          ...item,
          linkText: item.name,
          linkHref: item.slug,
        };
      });
      return desktopFooter;
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

// This is responsible for merging the strapi and central catalogue responses for buy-online footer section Mobile mweb
export function mergeWebGlobalResponse(results: AggregatedResponse[]): any {
  const strapiResult = results.find((r) => r.target === 'webGlobalPage');
  const centralCatalogueResult = results.find((r) => r.target === 'cca-categories');

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
  if (!centralCatalogueResult || !centralCatalogueResult.success) {
    Logger.warn('CCA fetch failed, returning original Strapi data');
    return strapiResult.data;
  }
  const appGlobalData = strapiResult.data; // This is the full response object
  const centralCatalogueSubMenus =
    centralCatalogueResult?.data?.data?.navigation?.[0]?.subMenu || [];
  try {
    const footerData = appGlobalData?.data?.footer || [];
    const globalFooter = footerData.find(
      (item: any) => item?.__component === 'global.global-footer',
    );
    if (globalFooter && globalFooter.footerSections) {
      const buyOnlineSection = globalFooter.footerSections.find(
        (s: any) => s?.heading === 'Buy online',
      );
      if (
        !isCentralCatalogueEnabled ||
        !centralCatalogueSubMenus ||
        !centralCatalogueSubMenus.length
      ) {
        return appGlobalData;
      }
      buyOnlineSection.links = centralCatalogueSubMenus.map((item) => {
        return {
          ...item,
          label: item.name,
          url: item.slug,
        };
      });
      return appGlobalData;
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

// This is responsible for merging the strapi and central catalogue responses for main menu
export function mergeMainMenuResponses(results: AggregatedResponse[]): any {
  const strapiResult = results.find((r) => r.target === 'header-main-menu');
  const centralCatalogueResult = results.find((r) => r.target === 'cca-header-categories');
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
  if (!isCentralCatalogueEnabled || !centralCatalogueResult || !centralCatalogueResult.success) {
    return strapiMainMenuData[0].navigation;
  }
  const mainMenuNavigationStrapi = strapiMainMenuData[0].navigation;
  const centralCatalogueNavigation =
    centralCatalogueResult?.data?.data?.navigation[0]?.subMenu || [];

  // taking the blogs and offers from strapi and adding it to ccaNavigation
  mainMenuNavigationStrapi.forEach((item) => {
    if (item?.name.toLowerCase() === 'blogs' || item?.name.toLowerCase() === 'offers') {
      centralCatalogueNavigation.push(item);
    }
  });

  return centralCatalogueNavigation;
}

export function selectProductSelectorResponse(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  safeDebug(
    Logger,
    () =>
      `cmsFeatureFlag response from selectProductSelectorResponse: ${safeToLog(
        responses['cmsFeatureFlag'],
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      `msmeProductSelector response from selectProductSelectorResponse: ${safeToLog(
        responses['msmeProductSelector'],
      )}`,
  );

  safeDebug(
    Logger,
    () =>
      `productSelectorV1 response from selectProductSelectorResponse: ${safeToLog(
        responses['productSelectorV1'],
      )}`,
  );

  const featureFlags = responses['cmsFeatureFlag']?.data?.data ?? [];

  const isCentralCatalogueEnabled =
    Array.isArray(featureFlags) &&
    featureFlags.some((f: any) => f?.name === 'central_catalogue_global' && f?.isActive === true);

  const selectedResponse = isCentralCatalogueEnabled
    ? responses['productSelectorV1']
    : responses['msmeProductSelector'];

  if (selectedResponse?.success) {
    return selectedResponse.data;
  }

  Logger.error(
    `[selectProductSelectorResponse] Selected target failed: ${selectedResponse?.target}`,
  );

  const downstreamStatus =
    selectedResponse?.downstreamResponse?.status ?? selectedResponse?.httpStatus ?? 500;

  const downstreamMessage =
    selectedResponse?.error || selectedResponse?.downstreamResponse?.error || 'Request failed';

  const error: any = new CustomError(downstreamMessage, downstreamStatus);
  error.httpStatusCode = downstreamStatus;
  error.downstreamResponse = selectedResponse?.downstreamResponse ?? null;

  throw error;
}

export function transformLegacyProductSelectorRequest(request: BaseRequest): BaseRequest {
  const body = request.body ?? {};
  return {
    ...request,
    body: {
      productMaterialMasterId:
        body.productMaterialMasterId ?? body.productKey ?? body.productMMID ?? null,
      productAttributes: Array.isArray(body.productAttributes) ? body.productAttributes : [],
    },
    headers: {
      ...request.headers,
    },
  };
}

export function transformV1ProductSelectorRequest(request: BaseRequest): BaseRequest {
  const body = request.body ?? {};

  return {
    ...request,
    body: {
      productKey: body.productKey ?? body.productMaterialMasterId ?? body.productMMID ?? null,
      productAttributes: Array.isArray(body.productAttributes) ? body.productAttributes : [],
    },
    headers: {
      ...request.headers,
    },
  };
}

export function transformLegacyUomConvertRequest(request: BaseRequest): BaseRequest {
  const body = request.body ?? {};

  if (!Array.isArray(body.uomRequests) || body.uomRequests.length === 0) {
    throw new CustomError(
      'Invalid request for central_commerce/uom-convert. Expected body with non-empty uomRequests array.',
      400,
    );
  }

  return {
    ...request,
    body: {
      uomRequests: Array.isArray(body.uomRequests) ? body.uomRequests : [],
    },
    headers: {
      ...request.headers,
    },
  };
}

export function transformV2UomConvertRequest(request: BaseRequest): BaseRequest {
  const body = request.body ?? {};

  const hasProductTypeKey =
    typeof body.productTypeKey === 'string' && body.productTypeKey.trim() !== '';

  const hasProductAttributes =
    Array.isArray(body.productAttributes) && body.productAttributes.length > 0;

  const hasCustomAttributes =
    Array.isArray(body.customAttributes) && body.customAttributes.length > 0;

  if (!hasProductTypeKey || !hasProductAttributes || !hasCustomAttributes) {
    throw new CustomError(
      'Invalid request for measurement-service/unit-of-measure/convert. Expected productTypeKey, non-empty productAttributes, and non-empty customAttributes.',
      400,
    );
  }
  return {
    ...request,
    body: {
      productTypeKey: body.productTypeKey ?? null,
      productAttributes: Array.isArray(body.productAttributes) ? body.productAttributes : [],
      customAttributes: Array.isArray(body.customAttributes) ? body.customAttributes : [],
    },
    headers: {
      ...request.headers,
    },
  };
}

export function selectUomConvertResponse(aggregatedResponses: AggregatedResponse[]): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const featureFlags = responses['cmsFeatureFlag']?.data?.data ?? [];
  const isCentralCatalogueEnabled =
    Array.isArray(featureFlags) &&
    featureFlags.some((f: any) => f?.name === 'central_catalogue_global' && f?.isActive === true);
  const preferredResponse = isCentralCatalogueEnabled
    ? responses['uom-convert-v2']
    : responses['uom-convert-legacy'];

  if (!preferredResponse) {
    throw new CustomError('Preferred UOM convert response not found', 500);
  }

  if (!preferredResponse.success) {
    const err = new CustomError(preferredResponse.error || 'UOM convert failed', 500) as any;
    err.httpStatusCode = preferredResponse.httpStatus || 500;
    err.downstreamResponse = preferredResponse.downstreamResponse;
    throw err;
  }

  return preferredResponse.data;
}

function getNormalizedPagination(body: any) {
  const offsetRaw = body?.offset ?? body?.offSet ?? 0;
  const limitRaw = body?.limit ?? 20;

  const offset = Number(offsetRaw);
  const limit = Number(limitRaw);

  return {
    offset: Number.isFinite(offset) ? offset : 0,
    limit: Number.isFinite(limit) ? limit : 20,
  };
}

function getRequiredSlug(body: any): string {
  const slug = String(body?.slug ?? '').trim();

  if (!slug) {
    throw new CustomError('Bad Request: slug is required', 400);
  }

  return slug;
}

export function selectCategoryConsolidatedTarget(req: any): string {
  const flag = req?.body?.central_catalogue_global;

  if (typeof flag !== 'boolean') {
    throw new CustomError('Bad Request: central_catalogue_global must be provided as boolean', 400);
  }

  return flag ? 'category-consolidated-central' : 'category-consolidated-legacy';
}

export function transformCentralCategoryProductsRequest(request: BaseRequest): BaseRequest {
  const body = request.body ?? {};
  const slug = getRequiredSlug(body);
  const { offset, limit } = getNormalizedPagination(body);
  const storefront = String(body?.storefront ?? 'msme').trim() || 'msme';

  return {
    ...request,
    body: {
      offSet: offset,
      limit,
      slug,
      storefront,
    },
    headers: {
      ...request.headers,
    },
  };
}

export function transformCentralCategoryBreadcrumbRequest(request: BaseRequest): BaseRequest {
  const slug = getRequiredSlug(request.body ?? {});

  return moveBodyToQueryParams({
    ...request,
    body: {
      slug,
    },
    headers: {
      ...request.headers,
    },
  });
}

export function mergeCentralCategoryConsolidatedResponse(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const productResponse = responses['central-products-listing'];
  const breadcrumbResponse = responses['central-breadcrumbs'];

  if (!productResponse?.success) {
    const err = new CustomError(
      productResponse?.error || 'Central category product listing failed',
      productResponse?.httpStatus ?? 500,
    ) as any;
    err.httpStatusCode = productResponse?.httpStatus ?? 500;
    err.downstreamResponse = productResponse?.downstreamResponse ?? null;
    throw err;
  }

  if (!breadcrumbResponse?.success) {
    const err = new CustomError(
      breadcrumbResponse?.error || 'Central category breadcrumb failed',
      breadcrumbResponse?.httpStatus ?? 500,
    ) as any;
    err.httpStatusCode = breadcrumbResponse?.httpStatus ?? 500;
    err.downstreamResponse = breadcrumbResponse?.downstreamResponse ?? null;
    throw err;
  }

  return {
    productData: productResponse.data,
    breadCrumbData: breadcrumbResponse.data,
  };
}

export function transformLegacyCategoryProductsRequest(request: BaseRequest): BaseRequest {
  const body = request.body ?? {};

  const categoryId = String(body.categoryId ?? '').trim();
  if (!categoryId) {
    throw new CustomError('Bad Request: categoryId is required for legacy flow', 400);
  }

  const offSet = Number(body.offSet ?? body.offset ?? 1);
  const limit = Number(body.limit ?? 20);

  return {
    ...request,
    body: {
      offSet: Number.isFinite(offSet) ? offSet : 1,
      limit: Number.isFinite(limit) ? limit : 20,
      categoryId,
      filterConditions: Array.isArray(body.filterConditions) ? body.filterConditions : [],
      directOrderProducts:
        typeof body.directOrderProducts === 'boolean' ? body.directOrderProducts : false,
      text: typeof body.text === 'string' ? body.text : '',
    },
    headers: {
      ...request.headers,
    },
  };
}

export function transformLegacyCategoryBreadcrumbRequest(request: BaseRequest): BaseRequest {
  const body = request.body ?? {};

  const categoryId = String(body.categoryId ?? '').trim();
  if (!categoryId) {
    throw new CustomError('Bad Request: categoryId is required for legacy breadcrumb flow', 400);
  }

  return moveBodyToQueryParams({
    ...request,
    body: {
      categoryId,
    },
    headers: {
      ...request.headers,
    },
  });
}

export function mergeLegacyCategoryConsolidatedResponse(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const productResponse = responses['legacy-products-listing'];
  const breadcrumbResponse = responses['legacy-breadcrumbs'];

  if (!productResponse?.success) {
    const err = new CustomError(
      productResponse?.error || 'Legacy category product listing failed',
      productResponse?.httpStatus ?? 500,
    ) as any;
    err.httpStatusCode = productResponse?.httpStatus ?? 500;
    err.downstreamResponse = productResponse?.downstreamResponse ?? null;
    throw err;
  }

  if (!breadcrumbResponse?.success) {
    const err = new CustomError(
      breadcrumbResponse?.error || 'Legacy category breadcrumb failed',
      breadcrumbResponse?.httpStatus ?? 500,
    ) as any;
    err.httpStatusCode = breadcrumbResponse?.httpStatus ?? 500;
    err.downstreamResponse = breadcrumbResponse?.downstreamResponse ?? null;
    throw err;
  }

  return {
    productData: productResponse.data,
    breadCrumbData: breadcrumbResponse.data,
  };
}
