/**
 * Simple localStorage wrapper with JSON serialization.
 */
export const storage = {
  save(key: string, value: unknown): void {
    try {
      const data = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, data);
    } catch (e) {
      console.warn(`[storage] Failed to save key "${key}":`, e);
    }
  },

  load<T>(key: string, defaultVal: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultVal;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    } catch (e) {
      console.warn(`[storage] Failed to load key "${key}":`, e);
      return defaultVal;
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[storage] Failed to remove key "${key}":`, e);
    }
  },
};
