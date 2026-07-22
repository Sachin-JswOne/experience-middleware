const PROMPTS_BASE = '/xp-mi/public/v1/central_commerce/ai/prompts';

export const API_ROUTES = {
  PROMPTS: {
    VERSIONS: (type: string) => `${PROMPTS_BASE}/${type}/versions`,
    CREATE: (_type: string) => `${PROMPTS_BASE}`,
    ACTIVATE: (type: string, v: number | string) =>
      `${PROMPTS_BASE}/${type}/versions/${v}/activate`,
  },
  METRICS: '/xp-mi/metrics',
  METRICS_SAMPLES: '/xp-mi/metrics/samples',
  AUTH: {
    OUTLOOK_LOGIN: (referer: string) =>
      `/xp-mi/public/v1/auth/outlook-login?referer=${encodeURIComponent(referer)}`,
  },
};
