import type { EmailSetupAccessService } from "@/modules/auth/emailSetupAccess/service";
import { fireAndForgetContactEmailSetup } from "@/modules/auth/emailSetupAccess/enqueueContactEmailSetup";
import { normalizeEmail } from "@/modules/auth/emailAuth";
import type { PatientOrganizationService } from "@/modules/patient-organization/service";
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "@/modules/platform-access/trustedPhonePolicy";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

export type CreateDoctorClientInput = {
  displayName?: string | null;
  phone: string;
  email?: string | null;
  createdByUserId: string;
  organizationId: string;
};

export type CreateDoctorClientResult =
  | {
      ok: true;
      userId: string;
      displayName: string;
      phoneNormalized: string;
      created: boolean;
      emailSetupEnqueued: boolean;
    }
  | { ok: false; error: "invalid_phone" | "invalid_email" | "email_conflict" | "create_failed" };

export async function createDoctorClient(
  input: CreateDoctorClientInput,
  deps: {
    patientOrganization: Pick<PatientOrganizationService, "createManualOrganizationClient">;
    emailSetupAccess: Pick<EmailSetupAccessService, "requestContactEmailSetup">;
  },
): Promise<CreateDoctorClientResult> {
  const phoneNormalized = normalizeRuPhoneE164(input.phone);
  if (!/^\+7\d{10}$/.test(phoneNormalized)) return { ok: false, error: "invalid_phone" };

  const emailRaw = input.email?.trim() || null;
  const emailNormalized = emailRaw ? normalizeEmail(emailRaw) : null;
  if (
    emailNormalized &&
    (emailNormalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized))
  ) {
    return { ok: false, error: "invalid_email" };
  }

  const displayName = input.displayName?.trim().slice(0, 500) || phoneNormalized;
  const registered = await deps.patientOrganization.createManualOrganizationClient({
    organizationId: input.organizationId,
    phoneNormalized,
    displayName,
    emailRaw,
    emailNormalized,
  });
  if (!registered.ok) {
    if (registered.error === "email_conflict") {
      return { ok: false, error: "email_conflict" };
    }
    return { ok: false, error: "create_failed" };
  }

  if (registered.created) {
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
    phoneNormalized: registered.phoneNormalized,
    created: registered.created,
    emailSetupEnqueued: Boolean(emailNormalized),
  };
}
