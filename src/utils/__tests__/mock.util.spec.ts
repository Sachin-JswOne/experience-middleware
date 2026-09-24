/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-require-imports */
// The config is read at module load, so each case re-imports the util with a fresh mock
// of it — which needs require() rather than a hoisted import.
import * as fs from 'fs';
import { TargetConfig } from 'src/models/route-config.model';

const MOCKS_DIR = '/mocks';

function loadUtil(env: { enabled: boolean; targets?: string[] }) {
  jest.resetModules();
  jest.doMock('src/config/mock.config', () => ({
    MOCK_ENABLED: env.enabled,
    MOCK_TARGETS: env.targets ?? [],
    MOCKS_DIR,
    describeMockMode: () => '',
  }));

  return require('../mock.util');
}

function target(overrides: Partial<TargetConfig> = {}): TargetConfig {
  return {
    name: 'offer-document-consent-store',
    url: 'https://example.com/consent',
    method: 'POST',
    stopOnError: true,
    timeout: { request: 1000, socket: 100 },
    headersToPass: [],
    mock: { file: 'offer-document/consent-store.json' },
    ...overrides,
  } as TargetConfig;
}

describe('mock.util', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('src/config/mock.config');
  });

  describe('isTargetMocked', () => {
    it('leaves a declared mock inert while mocking is off', () => {
      const { isTargetMocked } = loadUtil({ enabled: false });

      expect(isTargetMocked(target())).toBe(false);
    });

    it('mocks a target that declares a mock when mocking is on', () => {
      const { isTargetMocked } = loadUtil({ enabled: true });

      expect(isTargetMocked(target())).toBe(true);
    });

    it('never mocks a target that declares no mock', () => {
      const { isTargetMocked } = loadUtil({ enabled: true });

      expect(isTargetMocked(target({ mock: undefined }))).toBe(false);
    });

    it('honours a narrowing list so other targets still call their real downstream', () => {
      const { isTargetMocked } = loadUtil({ enabled: true, targets: ['some-other-target'] });

      expect(isTargetMocked(target())).toBe(false);
      expect(isTargetMocked(target({ name: 'some-other-target' }))).toBe(true);
    });

    it('accepts the bare-string shorthand for a mock file', () => {
      const { isTargetMocked } = loadUtil({ enabled: true });

      expect(isTargetMocked(target({ mock: 'offer-document/consent-store.json' }))).toBe(true);
    });
  });

  describe('loadMockResponse', () => {
    it('returns the file contents as the downstream response', async () => {
      const { loadMockResponse } = loadUtil({ enabled: true });
      jest
        .spyOn(fs, 'readFileSync')
        .mockReturnValue(JSON.stringify({ data: { consentId: 'cns_mock_1' } }) as any);

      const result = await loadMockResponse(target());

      expect(result.status).toBe(200);
      expect(result.data).toEqual({ data: { consentId: 'cns_mock_1' } });
    });

    it('raises a downstream failure when the mock declares a 4xx/5xx status', async () => {
      const { loadMockResponse } = loadUtil({ enabled: true });
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ error: 'boom' }) as any);

      const mocked = target({
        mock: { file: 'offer-document/consent-store-failure.json', status: 503 },
      });

      await expect(loadMockResponse(mocked)).rejects.toMatchObject({
        httpStatusCode: 503,
        downstreamResponse: { error: 'boom' },
      });
    });

    it('fails loudly when the mock file is missing', async () => {
      const { loadMockResponse } = loadUtil({ enabled: true });
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('ENOENT');
      });

      await expect(loadMockResponse(target())).rejects.toThrow('Mock file not found');
    });

    it('fails loudly when the mock file is not valid JSON', async () => {
      const { loadMockResponse } = loadUtil({ enabled: true });
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{ not json' as any);

      await expect(loadMockResponse(target())).rejects.toThrow('is not valid JSON');
    });

    it('refuses a mock path that escapes the mocks directory', async () => {
      const { loadMockResponse } = loadUtil({ enabled: true });
      const readSpy = jest.spyOn(fs, 'readFileSync');

      await expect(
        loadMockResponse(target({ mock: { file: '../../../etc/passwd' } })),
      ).rejects.toThrow('outside the mocks directory');
      expect(readSpy).not.toHaveBeenCalled();
    });
  });
});
