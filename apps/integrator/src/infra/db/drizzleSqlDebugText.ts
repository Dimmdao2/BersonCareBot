/**
 * Best-effort string for asserts on Drizzle `sql` fragments (Vitest / debug).
 * Not a substitute for EXPLAIN or dialect-specific SQL text.
 */
export function drizzleSqlFragmentToApproximateSql(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (typeof node !== 'object') return '';
  const rec = node as Record<string, unknown>;
  if (Array.isArray(rec.queryChunks)) {
    return rec.queryChunks.map((c) => drizzleSqlFragmentToApproximateSql(c)).join('');
  }
  if (Array.isArray(rec.value)) {
    return rec.value.map((c) => drizzleSqlFragmentToApproximateSql(c)).join('');
  }
  return '';
}
