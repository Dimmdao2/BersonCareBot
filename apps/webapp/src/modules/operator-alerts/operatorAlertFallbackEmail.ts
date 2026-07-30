import { z } from 'zod';

export const OPERATOR_FALLBACK_EMAIL_MAX_LENGTH = 320;

export type OperatorAlertFallbackEmailError = 'required' | 'too_long' | 'invalid_email';

export type OperatorAlertFallbackEmailResult =
  | { ok: true; value: string }
  | { ok: false; error: OperatorAlertFallbackEmailError };

const emailSchema = z.string().email();

export function normalizeOperatorAlertFallbackEmail(
  input: unknown,
): OperatorAlertFallbackEmailResult {
  if (typeof input !== 'string') return { ok: false, error: 'invalid_email' };
  const value = input.trim().toLowerCase();
  if (!value) return { ok: false, error: 'required' };
  if (value.length > OPERATOR_FALLBACK_EMAIL_MAX_LENGTH) {
    return { ok: false, error: 'too_long' };
  }
  if (!emailSchema.safeParse(value).success) return { ok: false, error: 'invalid_email' };
  return { ok: true, value };
}

export function parseOperatorAlertFallbackEmailSetting(valueJson: unknown): string | null {
  const inner =
    valueJson !== null &&
    typeof valueJson === 'object' &&
    'value' in (valueJson as Record<string, unknown>)
      ? (valueJson as Record<string, unknown>).value
      : valueJson;
  const normalized = normalizeOperatorAlertFallbackEmail(inner);
  return normalized.ok ? normalized.value : null;
}
