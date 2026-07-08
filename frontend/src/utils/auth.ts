import type { ILooseObject } from '@/_types/common.interface';

/**
 * Extracts distinct permission names from UAM user info.
 * Iterates organizations → applications → filters by UAMApplications → collects permission names from roles.
 */
export function processUamAuthorities(
  userInfo: ILooseObject,
  uamApplications: string[]
): string[] {
  const organizations = userInfo?.uamAuthorities?.organizations ?? [];
  const permissions: string[] = [];

  for (const org of organizations) {
    for (const app of org.applications ?? []) {
      if (uamApplications.includes(app.applicationKey)) {
        for (const role of app.roles ?? []) {
          for (const permission of role.permissions ?? []) {
            if (
              permission.permissionName &&
              !permissions.includes(permission.permissionName)
            ) {
              permissions.push(permission.permissionName);
            }
          }
        }
      }
    }
  }

  return permissions;
}
