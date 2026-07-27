import { readSession } from '@/utils/session';

/**
 * True when the logged-in user's UAM permissions include `name`.
 *
 * Client-side gating only — it hides controls the user cannot use. The backend
 * must enforce the same permission on the endpoint; this check is trivially
 * bypassable by editing localStorage.
 */
export function hasPermission(name: string): boolean {
  const permissions = readSession()?.permissions;
  return Array.isArray(permissions) && permissions.includes(name);
}
