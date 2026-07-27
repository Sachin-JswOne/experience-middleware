/**
 * localStorage with JSON encoding and SSR/no-window guards.
 *
 * `getItem` returns `unknown` on purpose: what comes back from storage is
 * whatever a previous build wrote, so callers must narrow it. `readSession`
 * and `loadPersisted` are the typed front doors — prefer those over calling
 * this directly.
 */
abstract class LocalStorage {
  static getItem(key: string): unknown {
    if (typeof window === 'undefined') {
      return null;
    }
    const item = window.localStorage.getItem(key);

    if (item === null) return undefined;

    if (item === 'null') return null;
    if (item === 'undefined') return undefined;

    try {
      return JSON.parse(item);
    } catch {
      // Not JSON — an older build may have stored a bare string.
      return item;
    }
  }

  static setItem(key: string, value: unknown) {
    if (typeof window === 'undefined') {
      return null;
    }
    if (value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  }

  static clearItems() {
    if (typeof window === 'undefined') {
      return null;
    }
    window.localStorage.clear();
  }

  static removeItem(item: string) {
    if (typeof window === 'undefined' && !item) {
      return null;
    }
    window.localStorage.removeItem(item);
  }
}

export default LocalStorage;
