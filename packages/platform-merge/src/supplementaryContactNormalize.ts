/**
 * Shared phone/email normalization for supplementary contacts (merge fallback + webapp).
 * Aligns with webapp `normalizeContactValue` for phone/email types.
 */

/** Same policy as webapp `normalizeRuPhoneE164`. */
export function normalizeRuPhoneE164(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  return `+${digits}`;
}

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
