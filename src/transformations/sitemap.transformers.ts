/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Logger } from '@nestjs/common';
import { replaceUriPrefix } from './cms.transformers';

/**
 * Transform Strapi jsw-main-menus response to sitemap format
 * Returns: { data: { navigation: [...] } }
 * Extracts navigation from first item and transforms subMenu structure
 */
export function transformSitemapCategories(response: any): any {
  try {
    // First apply URL prefix replacement (bucket to CDN)
    const responseWithReplacedUrls = replaceUriPrefix(response);

    // Extract navigation from first item
    // Response structure: { data: [{ navigation: [...] }] }
    const firstItem = responseWithReplacedUrls?.data?.[0];
    if (!firstItem || !firstItem.navigation) {
      return { data: { navigation: [] } };
    }

    // Transform subMenu structure recursively
    const transformedNavigation = transformSubMenuRecursive(
      firstItem.navigation,
    );

    return {
      data: {
        navigation: Array.isArray(transformedNavigation)
          ? transformedNavigation
          : [],
      },
    };
  } catch (error) {
    Logger.error('Error transforming sitemap categories', error);
    return { data: { navigation: [] } };
  }
}

/**
 * Transform Strapi subMenu structure to ensure arrays
 * Handles: { data: [] } -> [] and { data: [...] } -> [...]
 */
function transformSubMenuRecursive(data: any): any {
  if (Array.isArray(data)) {
    return data.map((item) => transformSubMenuRecursive(item));
  } else if (typeof data === 'object' && data !== null) {
    const item = { ...data };

    // Handle subMenu: { data: [] } -> subMenu: [] and { data: [...] } -> subMenu: [...]
    if (
      Object.prototype.hasOwnProperty.call(item, 'subMenu') &&
      typeof item.subMenu === 'object'
    ) {
      if (Array.isArray(item.subMenu)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        item.subMenu = item.subMenu.map((subItem: any) =>
          transformSubMenuRecursive(subItem),
        );
      } else if (item.subMenu && 'data' in item.subMenu) {
        // Handle subMenu: { data: [...] } -> subMenu: [...]
        const subMenuData = (item.subMenu as { data: any }).data;
        item.subMenu = Array.isArray(subMenuData)
          ? subMenuData.map((subItem: any) =>
              transformSubMenuRecursive(subItem),
            )
          : [];
      } else {
        item.subMenu = [];
      }
    }

    // Recursively process nested properties (excluding 'subMenu' itself)
    for (const key in item) {
      if (
        Object.prototype.hasOwnProperty.call(item, key) &&
        key !== 'subMenu'
      ) {
        item[key] = transformSubMenuRecursive(item[key]);
      }
    }
    return item;
  }
  return data;
}
