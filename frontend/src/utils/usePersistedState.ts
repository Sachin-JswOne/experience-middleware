import { useCallback, useState } from 'react';
import LocalStorage from '@/utils/LocalStorage';

/**
 * Reads a stored object once on mount and writes it back on every update.
 *
 * Stored values are merged over `defaults`, so a save written by an older
 * build (missing fields added since) still loads cleanly. Pass a `revive` to
 * validate/normalize anything more involved than a shallow merge.
 */
export const loadPersisted = <T extends object>(
  key: string,
  defaults: T,
  revive?: (stored: Partial<T>) => T,
): T => {
  const stored: unknown = LocalStorage.getItem(key);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return defaults;
  const partial = stored as Partial<T>;
  return revive ? revive(partial) : { ...defaults, ...partial };
};

export const usePersistedState = <T extends object>(
  key: string,
  defaults: T,
  revive?: (stored: Partial<T>) => T,
): [T, (next: T) => void] => {
  const [value, setValue] = useState<T>(() => loadPersisted(key, defaults, revive));

  const update = useCallback(
    (next: T) => {
      setValue(next);
      LocalStorage.setItem(key, next);
    },
    [key],
  );

  return [value, update];
};

/** List variant — for ring buffers and collections (saved views, history). */
export const loadPersistedList = <T>(key: string): T[] => {
  const stored: unknown = LocalStorage.getItem(key);
  return Array.isArray(stored) ? (stored as T[]) : [];
};

export const savePersistedList = <T>(key: string, items: T[]): void => {
  LocalStorage.setItem(key, items);
};
