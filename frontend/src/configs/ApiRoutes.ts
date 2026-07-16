const PROMPTS_BASE = '/xp-mi/public/v1/central_commerce/ai/prompts';

export const API_ROUTES = {
  PROMPTS: {
    VERSIONS: (type: string) => `${PROMPTS_BASE}/${type}/versions`,
    CREATE: (type: string) => `${PROMPTS_BASE}`,
    ACTIVATE: (type: string, v: number | string) =>
      `${PROMPTS_BASE}/${type}/versions/${v}/activate`,
  },
};
