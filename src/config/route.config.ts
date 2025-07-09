export const ROUTE_CONFIG = [
  {
    path: '/cms/v1/app-home-page',
    method: 'GET',
    targetUrl: 'http://cms-msme-ext.qa.jswone.in/api/app-home-page',
    targetMethod: 'GET',
    timeout: { request: 3000, socket: 1000 },
    requestTransform: 'cmsTransformer.transformAppHomePageGetRequest',
    transform: 'cmsTransformer.transformAppHomePageResponse',
  },
  {
    path: '/cms/v2/app-home-page',
    method: 'POST',
    targetUrl: 'http://cms-msme-ext.qa.jswone.in/api/app-home-page',
    targetMethod: 'GET',
    timeout: { request: 3000, socket: 1000 },
    requestTransform: 'cmsTransformer.transformAppHomePageRequest',
    transform: 'cmsTransformer.transformAppHomePageResponse',
  },
];
