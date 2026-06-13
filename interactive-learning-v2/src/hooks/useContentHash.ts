import { useCallback } from 'react';
import { computeContentHash } from '../utils/contentHash';

/**
 * Hook wrapping the content hash utility.
 */
export function useContentHash() {
  const getHash = useCallback((obj: unknown) => computeContentHash(obj), []);
  return { getHash };
}
