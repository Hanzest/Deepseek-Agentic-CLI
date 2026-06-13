/**
 * Compute a simple content fingerprint for deduplication.
 * Uses a 32-bit hash + content length for collision resistance.
 */
export function computeContentHash(jsonObj: unknown): string | null {
  try {
    const str = JSON.stringify(jsonObj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return `fp_${Math.abs(hash).toString(36)}_${str.length}`;
  } catch {
    return null;
  }
}
