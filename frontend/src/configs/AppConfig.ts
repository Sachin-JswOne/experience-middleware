import { VariantType } from 'notistack';

export interface INavigationMenu {
  id: number;
  label: string;
  route: string;
  requiredAction: string;
  icon: string;
  applicableRoutes: string[];
  preserveQueryParams?: boolean;
}

type ISnackbar_Auto_Hide_Durations = {
  [variant in VariantType]: number;
};

type AppConfigType = {
  APP_DISPLAY_NAME: string;
  NAVIGATION_MENUS: INavigationMenu[];
  SNACKBAR_AUTO_HIDE_DURATIONS: ISnackbar_Auto_Hide_Durations;
  COMPATIBLE_VERSION: string;
  UAMApplications: string[];
  CACHE_TTL: number;
};

const AppConfig: AppConfigType = {
  APP_DISPLAY_NAME: 'Central Catalogue Management',
  NAVIGATION_MENUS: [
    {
      id: 1,
      label: 'Dashboard',
      route: '/',
      requiredAction: '',
      icon: 'Dashboard',
      applicableRoutes: ['/'],
    },
    {
      id: 2,
      label: 'Products',
      route: '/products',
      requiredAction: 'VIEW_PRODUCT',
      icon: 'Inventory',
      applicableRoutes: ['/products'],
      preserveQueryParams: true,
    },
    {
      id: 3,
      label: 'Categories',
      route: '/categories',
      requiredAction: 'VIEW_CATEGORY',
      icon: 'Category',
      applicableRoutes: ['/categories'],
    },
    {
      id: 4,
      label: 'Users',
      route: '/users',
      requiredAction: 'VIEW_USER',
      icon: 'People',
      applicableRoutes: ['/users'],
    },
    {
      id: 5,
      label: 'Settings',
      route: '/settings',
      requiredAction: '',
      icon: 'Settings',
      applicableRoutes: ['/settings'],
    },
    {
      id: 6,
      label: 'Prompts',
      route: '/prompts',
      requiredAction: '',
      icon: 'SmartToy',
      applicableRoutes: ['/prompts'],
    },
  ],
  CACHE_TTL: 10 * 60 * 1000, // 10 minutes
  SNACKBAR_AUTO_HIDE_DURATIONS: {
    default: 5000,
    info: 5000,
    warning: 7000,
    success: 5000,
    error: 10000
  },
  COMPATIBLE_VERSION: '0.1.0',
  UAMApplications: ['central_catalogue_admin']
};

export default AppConfig;
