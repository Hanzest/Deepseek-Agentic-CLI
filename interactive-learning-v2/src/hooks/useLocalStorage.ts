import { useState, useCallback } from 'react';

/**
 * Generic hook for reading/writing to localStorage with state sync.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      try {
        localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (e) {
        console.warn(`[useLocalStorage] Failed to save "${key}":`, e);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}
