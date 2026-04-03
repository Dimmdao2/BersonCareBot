/**
 * Normalizes arbitrary RU-style phone input to a single canonical form used in `platform_users.phone_normalized`.
 * Policy: digits-only → E.164-like `+7XXXXXXXXXX` for 10-digit local RU numbers, plus 11-digit 7/8 prefixes.
 */
export function normalizeRuPhoneE164(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  return `+${digits}`;
}
