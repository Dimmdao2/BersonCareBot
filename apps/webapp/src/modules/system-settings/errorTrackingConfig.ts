export type ErrorTrackingConfigInput = Readonly<{
  enabled: boolean;
  dsn: string;
}>;

export type ErrorTrackingConfigSummary = Readonly<{
  enabled: boolean;
  hasStoredDsn: boolean;
}>;

export function normalizeErrorTrackingDsn(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2_048) return null;
  try {
    const parsed = new URL(raw);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      !parsed.hostname ||
      !parsed.username
    ) {
      return null;
    }
    if (
      parsed.search ||
      parsed.hash ||
      !/^[A-Za-z0-9_-]+$/.test(parsed.pathname.split('/').filter(Boolean).at(-1) ?? '')
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parseStoredBoolean(valueJson: unknown): boolean {
  return (
    valueJson !== null &&
    typeof valueJson === 'object' &&
    (valueJson as Record<string, unknown>).value === true
  );
}

export function parseStoredString(valueJson: unknown): string {
  if (valueJson === null || typeof valueJson !== 'object') return '';
  const value = (valueJson as Record<string, unknown>).value;
  return typeof value === 'string' ? value.trim() : '';
}
