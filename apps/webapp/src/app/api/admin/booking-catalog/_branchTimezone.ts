/** Server-side IANA check (Node Intl). */
function assertValidIanaTimezone(trimmed: string): string {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
  } catch {
    throw new Error("timezone_invalid_iana");
  }
  return trimmed;
}

/** POST create: optional field → default Europe/Moscow; must be non-empty and valid IANA when resolved. */
export function normalizeAdminBranchTimezoneForCreate(raw: string | undefined | null): string {
  const t = (raw?.trim() ? raw.trim() : "Europe/Moscow").trim();
  if (!t) throw new Error("timezone_empty");
  return assertValidIanaTimezone(t);
}

/** PATCH: explicit timezone must be non-empty after trim. */
export function normalizeAdminBranchTimezoneForPatch(raw: string): string {
  const t = raw.trim();
  if (!t) throw new Error("timezone_empty");
  return assertValidIanaTimezone(t);
}
