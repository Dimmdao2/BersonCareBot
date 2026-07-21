import type { EmailSetupAccessService } from "@/modules/auth/emailSetupAccess/service";
import { fireAndForgetContactEmailSetup } from "@/modules/auth/emailSetupAccess/enqueueContactEmailSetup";
import { normalizeEmail } from "@/modules/auth/emailAuth";
import type { PatientOrganizationService } from "@/modules/patient-organization/service";
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "@/modules/platform-access/trustedPhonePolicy";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import { normalizeFioPart } from "@/shared/lib/fio";

export type CreateDoctorClientInput = {
  lastName: string;
  firstName: string;
  patronymic?: string | null;
  phone?: string | null;
  email?: string | null;
  createdByUserId: string;
  organizationId: string;
};

export type CreateDoctorClientResult =
  | {
      ok: true;
      userId: string;
      displayName: string;
      lastName: string | null;
      firstName: string | null;
      patronymic: string | null;
      phoneNormalized: string | null;
      created: boolean;
      emailSetupEnqueued: boolean;
    }
  | { ok: false; error: "invalid_fio" | "invalid_phone" | "invalid_email" | "email_conflict" | "create_failed" };

export async function createDoctorClient(
  input: CreateDoctorClientInput,
  deps: {
    patientOrganization: Pick<PatientOrganizationService, "createManualOrganizationClient">;
    emailSetupAccess: Pick<EmailSetupAccessService, "requestContactEmailSetup">;
  },
): Promise<CreateDoctorClientResult> {
  const emailRaw = input.email?.trim() || null;
  const emailNormalized = emailRaw ? normalizeEmail(emailRaw) : null;
  if (
    emailNormalized &&
    (emailNormalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized))
  ) {
    return { ok: false, error: "invalid_email" };
  }

  const phoneRaw = input.phone?.trim() ?? "";
  const phoneNormalized = phoneRaw ? normalizeRuPhoneE164(phoneRaw) : null;
  if (phoneRaw && (!phoneNormalized || !/^\+7\d{10}$/.test(phoneNormalized))) {
    return { ok: false, error: "invalid_phone" };
  }
  // Email-only identity creation has different dedup/proof semantics and is not part of #806.
  // The sanctioned contactless path carries neither contact until invite OTP claim.
  if (!phoneNormalized && emailNormalized) return { ok: false, error: "invalid_phone" };

  const lastName = normalizeFioPart(input.lastName);
  const firstName = normalizeFioPart(input.firstName);
  const patronymic = normalizeFioPart(input.patronymic);
  if (!lastName || !firstName) return { ok: false, error: "invalid_fio" };
  const registered = await deps.patientOrganization.createManualOrganizationClient({
    organizationId: input.organizationId,
    phoneNormalized,
    lastName,
    firstName,
    patronymic,
    emailRaw,
    emailNormalized,
  });
  if (!registered.ok) {
    if (registered.error === "email_conflict") {
      return { ok: false, error: "email_conflict" };
    }
    return { ok: false, error: "create_failed" };
  }

  if (registered.created && registered.phoneNormalized) {
    trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.DoctorStaffClientCreate);
  }
  if (emailNormalized) {
    fireAndForgetContactEmailSetup(
      deps.emailSetupAccess,
      {
        userId: registered.userId,
        emailNormalized,
        source: "doctor_profile",
        createdByUserId: input.createdByUserId,
      },
      { hook: "doctor.clients.create" },
    );
  }

  return {
    ok: true,
    userId: registered.userId,
    displayName: registered.displayName,
    lastName: registered.lastName,
    firstName: registered.firstName,
    patronymic: registered.patronymic,
    phoneNormalized: registered.phoneNormalized,
    created: registered.created,
    emailSetupEnqueued: Boolean(emailNormalized),
  };
}
