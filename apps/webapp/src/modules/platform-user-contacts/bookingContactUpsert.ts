import { normalizeContactValue } from "./normalizeContactValue";
import type { PlatformUserContactRecord } from "./ports";
import type { PlatformUserContactsService } from "./service";
import type { PlatformUserContactSource } from "./types";

export type BookingContactSnapshotInput = {
  platformUserId: string;
  contactPhone: string;
  contactEmail?: string | null;
};

/** Best-effort upsert of booking form phone/email into supplementary contacts (does not touch identity). */
export async function upsertBookingFormContactsBestEffort(
  service: PlatformUserContactsService | null | undefined,
  input: BookingContactSnapshotInput,
): Promise<void> {
  if (!service) return;

  const phone = input.contactPhone.trim();
  if (phone) {
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
  if (email) {
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

function normalizeIdentityEmail(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  return normalizeContactValue("email", email);
}

function normalizeIdentityPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  return normalizeContactValue("phone", phone);
}

/** Doctor-facing list: hide rows that duplicate identity phone/email on `platform_users`. */
export function toDoctorSupplementaryContacts(
  contacts: PlatformUserContactRecord[],
  identity: { phone?: string | null; email?: string | null },
): DoctorSupplementaryContact[] {
  const identityPhone = normalizeIdentityPhone(identity.phone);
  const identityEmail = normalizeIdentityEmail(identity.email);

  return contacts
    .filter((row) => {
      if ((row.contactType === "phone" || row.contactType === "whatsapp") && identityPhone) {
        return row.valueNormalized !== identityPhone;
      }
      if (row.contactType === "email" && identityEmail) {
        return row.valueNormalized !== identityEmail;
      }
      return true;
    })
    .map((row) => ({
      id: row.id,
      contactType: row.contactType,
      value: row.value,
      source: row.source as PlatformUserContactSource,
    }));
}
