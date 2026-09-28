import * as path from 'path';
import * as dotenv from 'dotenv';
import { APP_ENV } from './app.config';

dotenv.config();

/** Mocks are a local/QA aid, never a production behaviour. */
const MOCKABLE_ENVS = ['local', 'dev', 'qa'];

function readBool(value: string | undefined): boolean {
  return String(value ?? '').toLowerCase() === 'true';
}

/**
 * Master switch. With mocks off (the default) every target calls its real downstream, so
 * a stray `mock` block in route-config.json is inert.
 */
export const MOCK_ENABLED = readBool(process.env.MOCK_ENABLED) && MOCKABLE_ENVS.includes(APP_ENV);

/**
 * Optional narrowing: a comma separated list of target names to mock. Empty (or `*`)
 * means every target that declares a mock. Use it to mock one unavailable service while
 * the rest of an aggregate still hits the real thing.
 */
export const MOCK_TARGETS: string[] = String(process.env.MOCK_TARGETS ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

/** Mock payloads live here, and are copied into dist by the `assets/**\/*.json` rule. */
export const MOCKS_DIR = path.resolve(__dirname, '../assets/mocks');

/** True when mocking is on at all — logged once at boot so it is never a silent mode. */
export function describeMockMode(): string {
  if (!MOCK_ENABLED) {
    if (readBool(process.env.MOCK_ENABLED)) {
      return `MOCK_ENABLED was set but APP_ENV=${APP_ENV} does not allow mocking — mocks are OFF`;
    }
    return 'mocks are OFF';
  }

  const scope = MOCK_TARGETS.length ? MOCK_TARGETS.join(', ') : 'all targets declaring a mock';

  return `MOCKS ARE ON (env=${APP_ENV}, scope=${scope})`;
}
