import LocalStorage from '@/utils/LocalStorage';

/** True when the logged-in user's UAM permissions include `name`. */
export function hasPermission(name: string): boolean {
  const permissions: unknown = LocalStorage.getItem('userInfo')?.permissions;
  return Array.isArray(permissions) && permissions.includes(name);
}
