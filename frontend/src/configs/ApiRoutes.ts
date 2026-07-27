const PROMPTS_BASE = '/xp-mi/public/v1/central_commerce/ai/prompts';
const AUTH_BASE = '/xp-mi/public/v1/auth';

export const API_ROUTES = {
  PROMPTS: {
    VERSIONS: (type: string) => `${PROMPTS_BASE}/${type}/versions`,
    CREATE: (_type: string) => `${PROMPTS_BASE}`,
    ACTIVATE: (type: string, v: number | string) =>
      `${PROMPTS_BASE}/${type}/versions/${v}/activate`,
  },
  METRICS: '/xp-mi/metrics',
  METRICS_STREAM: '/xp-mi/metrics/stream',
  METRICS_SAMPLES: '/xp-mi/metrics/samples',
  METRICS_HEALTH: '/xp-mi/metrics/health',
  METRICS_ROUTE_TIMELINE: '/xp-mi/metrics/route-timeline',
  METRICS_ALERT_CONFIG: '/xp-mi/metrics/alert-config',
  METRICS_ALERT_HISTORY: '/xp-mi/metrics/alert-history',
  VALKEY_ADMIN: {
    STATUS: '/xp-mi/admin/cache/status',
    INFO: '/xp-mi/admin/cache/info',
    CLUSTER_NODES: '/xp-mi/admin/cache/cluster/nodes',
    CLIENTS: '/xp-mi/admin/cache/clients',
    KEYS: '/xp-mi/admin/cache/keys',
    KEY_DETAIL: (key: string) => `/xp-mi/admin/cache/keys/detail?key=${encodeURIComponent(key)}`,
    KEYS_DELETE: '/xp-mi/admin/cache/keys/delete',
    FLUSH: '/xp-mi/admin/cache/flush',
  },
  AUTH: {
    OUTLOOK_LOGIN: (referer: string) =>
      `${AUTH_BASE}/outlook-login?referer=${encodeURIComponent(referer)}`,
    SESSION_EXCHANGE: (authId: string) =>
      `${AUTH_BASE}/session/exchange?auth-id=${encodeURIComponent(authId)}`,
    SESSION: `${AUTH_BASE}/session`,
    SESSION_LOGOUT: `${AUTH_BASE}/session/logout`,
  },
};
