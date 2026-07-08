import LocalStorage from '@/utils/LocalStorage';

export const redirectToLogin = (router: any, pathname: string) => {
  router.push(`/login?redirectTo=${encodeURIComponent(pathname)}`);
};

export const getUserAllowedActions = (): string[] => {
  const userInfo = LocalStorage.getItem('userInfo');
  return Array.isArray(userInfo?.authorities) ? userInfo?.authorities : [];
};

export const isEmptyValue = (value: any): boolean => {
  if (value === null || value === undefined) {
    return true;
  }

  // String: trim and check length
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  // Empty array
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }

  // Empty object
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  ) {
    return true;
  }

  return false;
};
