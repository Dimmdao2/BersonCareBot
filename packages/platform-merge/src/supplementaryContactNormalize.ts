import { normalizeRuPhoneE164 } from '@bersoncare/shared-contracts';

export { normalizeRuPhoneE164 } from '@bersoncare/shared-contracts';

export function normalizeSupplementaryContactPhone(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const normalized = normalizeRuPhoneE164(trimmed);
  if (!/^\+\d{10,15}$/.test(normalized)) return null;
  return normalized;
}

export function normalizeSupplementaryContactEmail(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}
