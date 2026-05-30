import {
  normalizeSupplementaryContactEmail,
  normalizeSupplementaryContactPhone,
} from "@bersoncare/platform-merge";
import { normalizeContactValue } from "./normalizeContactValue";
import type { PlatformUserContactType } from "./types";

export type IdentityContactFields = {
  phone?: string | null;
  email?: string | null;
};

export function normalizeIdentityPhone(phone: string | null | undefined): string | null {
  return normalizeSupplementaryContactPhone(phone);
}

export function normalizeIdentityEmail(email: string | null | undefined): string | null {
  return normalizeSupplementaryContactEmail(email);
}

/** True when a supplementary row duplicates identity phone/email on `platform_users`. */
export function supplementaryContactMatchesIdentity(
  contactType: PlatformUserContactType,
  valueNormalized: string,
  identity: IdentityContactFields,
): boolean {
  const identityPhone = normalizeIdentityPhone(identity.phone);
  const identityEmail = normalizeIdentityEmail(identity.email);

  if ((contactType === "phone" || contactType === "whatsapp") && identityPhone) {
    return valueNormalized === identityPhone;
  }
  if (contactType === "email" && identityEmail) {
    return valueNormalized === identityEmail;
  }
  return false;
}

/** Booking/merge best-effort: skip upsert when value equals identity contact. */
export function shouldSkipSupplementaryContactUpsert(
  contactType: "phone" | "email",
  value: string,
  identity?: IdentityContactFields | null,
): boolean {
  if (!identity) return false;
  const valueNormalized = normalizeContactValue(contactType, value);
  if (!valueNormalized) return true;
  return supplementaryContactMatchesIdentity(contactType, valueNormalized, identity);
}
