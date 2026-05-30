import {
  type IdentityContactFields,
  supplementaryContactMatchesIdentity,
  shouldSkipSupplementaryContactUpsert,
} from "./identityContactMatch";
import { normalizeContactValue } from "./normalizeContactValue";
import type { PlatformUserContactRecord } from "./ports";
import type { PlatformUserContactsService } from "./service";
import type { PlatformUserContactSource } from "./types";

export type BookingContactSnapshotInput = {
  platformUserId: string;
  contactPhone: string;
  contactEmail?: string | null;
  /** When set, phone/email equal to identity are not written to supplementary contacts. */
  identity?: IdentityContactFields | null;
};

/** Best-effort upsert of booking form phone/email into supplementary contacts (does not touch identity). */
export async function upsertBookingFormContactsBestEffort(
  service: PlatformUserContactsService | null | undefined,
  input: BookingContactSnapshotInput,
): Promise<void> {
  if (!service) return;

  const phone = input.contactPhone.trim();
  if (phone && !shouldSkipSupplementaryContactUpsert("phone", phone, input.identity)) {
    const valueNormalized = normalizeContactValue("phone", phone);
    if (valueNormalized) {
      try {
        await service.upsert({
          platformUserId: input.platformUserId,
          contactType: "phone",
          value: phone,
          source: "booking",
        });
      } catch {
        // Booking success must not depend on supplementary contacts persistence.
      }
    }
  }

  const email = input.contactEmail?.trim();
  if (email && !shouldSkipSupplementaryContactUpsert("email", email, input.identity)) {
    const valueNormalized = normalizeContactValue("email", email);
    if (valueNormalized) {
      try {
        await service.upsert({
          platformUserId: input.platformUserId,
          contactType: "email",
          value: email,
          source: "booking",
        });
      } catch {
        // Booking success must not depend on supplementary contacts persistence.
      }
    }
  }
}

export type DoctorSupplementaryContact = Pick<
  PlatformUserContactRecord,
  "id" | "contactType" | "value" | "source"
>;

/** Doctor-facing list: hide rows that duplicate identity phone/email on `platform_users`. */
export function toDoctorSupplementaryContacts(
  contacts: PlatformUserContactRecord[],
  identity: IdentityContactFields,
): DoctorSupplementaryContact[] {
  return contacts
    .filter((row) => !supplementaryContactMatchesIdentity(row.contactType, row.valueNormalized, identity))
    .map((row) => ({
      id: row.id,
      contactType: row.contactType,
      value: row.value,
      source: row.source as PlatformUserContactSource,
    }));
}

export type { IdentityContactFields } from "./identityContactMatch";
