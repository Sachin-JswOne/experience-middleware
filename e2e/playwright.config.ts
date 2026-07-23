import { defineConfig } from '@playwright/test';

// Smoke tests for the observability dashboard.
//
// One-time setup:   npx playwright install chromium
// Run:              npm run e2e
// Against an env:   E2E_BASE_URL=https://... E2E_AUTH_TOKEN=<jwt> npm run e2e
//
// E2E_AUTH_TOKEN is seeded into localStorage as the login token the metrics
// endpoints expect; without it the suite only verifies the login redirect.
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
