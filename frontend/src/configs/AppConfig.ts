import { VariantType } from 'notistack';
import { PROMPT_TYPES } from './PromptConfig';

export interface INavigationMenu {
  id: number;
  label: string;
  route: string;
  requiredAction: string;
  icon: string;
  applicableRoutes: string[];
  preserveQueryParams?: boolean;
  children?: INavigationMenu[];
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

type PromptFeatureMenu = INavigationMenu & { children: INavigationMenu[] };

const buildPromptMenuChildren = (): INavigationMenu[] => {
  const featureMap = new Map<string, PromptFeatureMenu>();

  PROMPT_TYPES.forEach((type) => {
    if (!featureMap.has(type.feature)) {
      const featureId = 70 + featureMap.size;
      featureMap.set(type.feature, {
        id: featureId,
        label: type.feature,
        route: `/prompts/${type.promptType}`,
        requiredAction: '',
        icon: 'Assistant',
        applicableRoutes: [],
        children: [],
      });
    }

    const feature = featureMap.get(type.feature)!;
    const childRoute = `/prompts/${type.promptType}`;
    feature.children.push({
      id: feature.id * 10 + feature.children.length + 1,
      label: type.label,
      route: childRoute,
      requiredAction: '',
      icon: 'Assistant',
      applicableRoutes: [childRoute],
    });
    feature.applicableRoutes.push(childRoute);
  });

  return Array.from(featureMap.values());
};

const AppConfig: AppConfigType = {
  APP_DISPLAY_NAME: 'BEFE ADMIN',
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
      label: 'Metrics',
      route: '/metrics',
      requiredAction: '',
      icon: 'BarChart',
      applicableRoutes: ['/metrics'],
    },
    {
      id: 6,
      label: 'Prompts',
      route: '/prompts',
      requiredAction: '',
      icon: 'Assistant',
      applicableRoutes: ['/prompts'],
      children: buildPromptMenuChildren(),
    },
  ],
  CACHE_TTL: 10 * 60 * 1000, // 10 minutes
  SNACKBAR_AUTO_HIDE_DURATIONS: {
    default: 5000,
    info: 5000,
    warning: 7000,
    success: 5000,
    error: 10000,
  },
  COMPATIBLE_VERSION: '0.1.0',
  UAMApplications: ['central_catalogue_admin'],
};

export default AppConfig;
