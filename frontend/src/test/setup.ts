import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Vitest 4's jsdom environment does not expose `window.localStorage` on
 * Node 26 (Node now defines its own experimental `globalThis.localStorage`,
 * which is unavailable without --localstorage-file and shadows jsdom's).
 * The app legitimately uses `window.localStorage`, so provide a spec-shaped
 * in-memory Storage for tests rather than weakening the source.
 */
const installMemoryStorage = () => {
  if (typeof window === 'undefined' || window.localStorage) return;

  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    key: (index) => [...store.keys()][index] ?? null,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
  };

  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
};

installMemoryStorage();

// Each test starts from a clean DOM and a clean browser store — several
// modules (session, saved views, alert thresholds) read storage on load.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
