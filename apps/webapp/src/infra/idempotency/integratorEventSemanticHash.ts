/**
 * Deterministic serialization for idempotency keys and command fingerprints.
 */
export function stableStringifyForIdempotency(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringifyForIdempotency(item)).join(',')}]`;
  }
  if (t === 'object') {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringifyForIdempotency(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}
