/**
 * Normalizes admin PATCH body inner `value` for boolean system_settings keys.
 * Matches legacy acceptance: boolean, "true"/"false", 1/0.
 */
export function coerceAdminBooleanSetting(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return null;
}
