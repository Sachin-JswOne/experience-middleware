import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { MOCK_ENABLED, MOCK_TARGETS, MOCKS_DIR } from 'src/config/mock.config';
import { MockConfig, TargetConfig } from 'src/models/route-config.model';
import { CustomError } from './CustomError';

const logger = new Logger('MockResponses');

export interface MockResult {
  data: any;
  status: number;
}

function normalizeMock(mock: TargetConfig['mock']): MockConfig | null {
  if (!mock) return null;

  return typeof mock === 'string' ? { file: mock } : mock;
}

/**
 * A target is mocked when mocking is on, the target declares a mock file, and either no
 * narrowing list was given or the target is on it.
 */
export function isTargetMocked(target: TargetConfig): boolean {
  if (!MOCK_ENABLED) return false;

  const mock = normalizeMock(target.mock);
  if (!mock?.file) return false;

  if (MOCK_TARGETS.length === 0 || MOCK_TARGETS.includes('*')) return true;

  return MOCK_TARGETS.includes(target.name ?? '');
}

/** Keeps a mock file from reaching outside the mocks directory. */
function resolveMockPath(file: string): string {
  const resolved = path.resolve(MOCKS_DIR, file);
  const root = path.resolve(MOCKS_DIR);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new CustomError(`Mock file '${file}' resolves outside the mocks directory`, 500);
  }

  return resolved;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Loads a target's mock in place of calling it.
 *
 * The file holds the downstream response body exactly as the real service would return
 * it, so the target's `resTransform` and the route's aggregation still run — a mocked run
 * exercises the same pipeline as a real one. A `status` of 400 or more is raised as a
 * downstream failure instead, which is how failure paths get tested.
 *
 * Files are read per request rather than cached, so editing a mock takes effect without a
 * restart.
 */
export async function loadMockResponse(target: TargetConfig): Promise<MockResult> {
  const mock = normalizeMock(target.mock) as MockConfig;
  const filePath = resolveMockPath(mock.file);
  const targetName = target.name || target.url;

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    throw new CustomError(`Mock file not found for target '${targetName}': ${mock.file}`, 500);
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new CustomError(
      `Mock file for target '${targetName}' is not valid JSON: ${(error as Error).message}`,
      500,
    );
  }

  if (mock.delayMs && mock.delayMs > 0) {
    await delay(mock.delayMs);
  }

  const status = mock.status ?? 200;

  logger.warn(
    `[MOCKED RESPONSE] target=${targetName} file=${mock.file} status=${status} — no downstream call was made`,
  );

  if (status >= 400) {
    const error = new CustomError(
      `Mocked failure from target '${targetName}' (status ${status})`,
      status,
    );
    error.downstreamResponse = data;
    throw error;
  }

  return { data, status };
}
