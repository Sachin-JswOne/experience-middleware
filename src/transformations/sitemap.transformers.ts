/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Logger } from '@nestjs/common';

/**
 * Transform Strapi jsw-main-menus response to sitemap format
 * Returns: { data: { navigation: [...] } }
 * Extracts navigation from first item and transforms subMenu structure
 */
export function transformSitemapCategories(response: any): any {
  try {
    // Extract navigation from first item
    // Response structure: { data: [{ navigation: [...] }] }
    const firstItem = response?.data?.[0];
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
 * Transform Strapi subMenu structure and extract only needed fields
 * Handles: { data: [] } -> [] and { data: [...] } -> [...]
 * Only keeps: id, name, slug, subMenu (removes metaImage, createdAt, etc.)
 */
function transformSubMenuRecursive(data: any): any {
  if (Array.isArray(data)) {
    return data.map((item) => transformSubMenuRecursive(item));
  } else if (typeof data === 'object' && data !== null) {
    // Extract only needed fields: id, name, slug, subMenu
    const filteredItem: any = {
      id: data.id,
      name: data.name,
      slug: data.slug,
    };

    // Handle subMenu: { data: [] } -> [] and { data: [...] } -> [...]
    if (
      Object.prototype.hasOwnProperty.call(data, 'subMenu') &&
      typeof data.subMenu === 'object'
    ) {
      if (Array.isArray(data.subMenu)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        filteredItem.subMenu = data.subMenu.map((subItem: any) =>
          transformSubMenuRecursive(subItem),
        );
      } else if (data.subMenu && 'data' in data.subMenu) {
        // Handle subMenu: { data: [...] } -> subMenu: [...]
        const subMenuData = (data.subMenu as { data: any }).data;
        filteredItem.subMenu = Array.isArray(subMenuData)
          ? subMenuData.map((subItem: any) =>
              transformSubMenuRecursive(subItem),
            )
          : [];
      } else {
        filteredItem.subMenu = [];
      }
    } else {
      filteredItem.subMenu = [];
    }

    return filteredItem;
  }
  return data;
}
