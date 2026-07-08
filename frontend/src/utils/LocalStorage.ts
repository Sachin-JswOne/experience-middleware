abstract class LocalStorage {
  static getItem(key: string) {
    if (typeof window === 'undefined') {
      return null;
    }
    const item = localStorage.getItem(key);

    if (item === null) return undefined;

    if (item === 'null') return null;
    if (item === 'undefined') return undefined;

    try {
      return JSON.parse(item);
    } catch {}

    return item;
  }

  static setItem(key: string, value: any) {
    if (typeof window === 'undefined') {
      return null;
    }
    if (value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  static clearItems() {
    if (typeof window === 'undefined') {
      return null;
    }
    localStorage.clear();
  }

  static removeItem(item: string) {
    if (typeof window === 'undefined' && !item) {
      return null;
    }
    localStorage.removeItem(item);
  }
}

export default LocalStorage;
