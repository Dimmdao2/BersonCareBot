/** Keep in sync with `apps/webapp/src/shared/phone/normalizeRuPhoneE164.ts`. */
export function normalizeRuPhoneE164(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("9")) return `+7${digits}`;
  return `+${digits}`;
}
