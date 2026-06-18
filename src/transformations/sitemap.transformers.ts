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
    if (!firstItem?.navigation) {
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
function transformSubMenuItems(subMenu: any): any[] {
  if (Array.isArray(subMenu)) {
    return subMenu.map((subItem: any) => transformSubMenuRecursive(subItem));
  }

  if (subMenu?.data && Array.isArray(subMenu.data)) {
    return subMenu.data.map((subItem: any) => transformSubMenuRecursive(subItem));
  }

  return [];
}

function transformSubMenuRecursive(data: any): any {
  if (Array.isArray(data)) {
    return data.map((item) => transformSubMenuRecursive(item));
  }

  if (typeof data !== 'object' || data === null) {
    return data;
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    subMenu: transformSubMenuItems(data.subMenu),
  };
}
