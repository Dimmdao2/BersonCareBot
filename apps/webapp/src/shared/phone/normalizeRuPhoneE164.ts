/**
 * Normalizes arbitrary RU-style phone input to a single canonical form used in `platform_users.phone_normalized`.
 * Policy: digits-only → E.164-like `+7XXXXXXXXXX` for typical RU mobile (10 digits starting with 9) and 11-digit 7/8 prefixes.
 */
export function normalizeRuPhoneE164(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("9")) return `+7${digits}`;
  return `+${digits}`;
}
