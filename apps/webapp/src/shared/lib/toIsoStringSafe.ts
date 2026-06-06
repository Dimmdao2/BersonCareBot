/** Normalize PG timestamp values from node-pg (`Date`) or Drizzle bridge (`string`). */
export function toIsoStringSafe(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toISOString();
}

export function nullableToIsoStringSafe(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  return toIsoStringSafe(value);
}
