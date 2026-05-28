import { maskPhoneForHealthArchive } from "@/modules/operator-health/humanizeOutgoingDeliveryLastError";

export type AuthRegistrationContactType = "email" | "phone" | "oauth_provider";

/** Mask email for logs: `u***@example.com`. */
export function maskEmailForContactHint(email: string | null | undefined): string | null {
  const raw = email?.trim();
  if (!raw) return null;
  const at = raw.indexOf("@");
  if (at <= 0) return "***";
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (!domain) return "***";
  const first = local.charAt(0) || "*";
  return `${first}***@${domain}`;
}

/** Mask phone for logs (reuses health archive pattern). */
export function maskPhoneForContactHint(phone: string | null | undefined): string | null {
  return maskPhoneForHealthArchive(phone);
}

export function maskContactHint(
  contactType: AuthRegistrationContactType,
  value: string | null | undefined,
): string | null {
  switch (contactType) {
    case "email":
      return maskEmailForContactHint(value);
    case "phone":
      return maskPhoneForContactHint(value);
    case "oauth_provider":
      return value?.trim() || null;
    default:
      return null;
  }
}
