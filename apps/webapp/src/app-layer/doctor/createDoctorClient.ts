import { fireAndForgetContactEmailSetup } from "@/modules/auth/emailSetupAccess/enqueueContactEmailSetup";
import type { EmailSetupAccessService } from "@/modules/auth/emailSetupAccess/service";
import { resolveOrCreateDoctorClientByPhone } from "@/infra/repos/pgDoctorClientCreate";
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
  emailSetupAccess: Pick<EmailSetupAccessService, "requestContactEmailSetup">,
): Promise<CreateDoctorClientResult> {
  const phoneNormalized = normalizeRuPhoneE164(input.phone.trim());
  if (!/^\+7\d{10}$/.test(phoneNormalized)) {
    return { ok: false, error: "invalid_phone" };
  }

  const emailRaw = input.email?.trim() ?? "";
  const emailNorm = emailRaw ? emailRaw.toLowerCase() : null;
  if (emailRaw && !zEmailSafe(emailRaw)) {
    return { ok: false, error: "invalid_email" };
  }

  const displayName =
    input.displayName?.trim().slice(0, 500) ||
    emailRaw ||
    phoneNormalized;

  trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.DoctorStaffClientCreate);

  const createdClient = await resolveOrCreateDoctorClientByPhone({
    phoneNormalized,
    displayName,
    emailRaw: emailRaw || null,
    emailNormalized: emailNorm,
  });
  if (!createdClient.ok) return createdClient;
  if (!createdClient.created) {
    return {
      ok: true,
      userId: createdClient.userId,
      displayName: createdClient.displayName,
      phoneNormalized: createdClient.phoneNormalized,
      created: false,
      emailSetupEnqueued: false,
    };
  }

  let emailSetupEnqueued = false;
  if (emailNorm) {
    fireAndForgetContactEmailSetup(
      emailSetupAccess,
      {
        userId: createdClient.userId,
        emailNormalized: emailNorm,
        source: "doctor_profile",
        createdByUserId: input.createdByUserId,
      },
      { hook: "doctor_client_create" },
    );
    emailSetupEnqueued = true;
  }

  return {
    ok: true,
    userId: createdClient.userId,
    displayName: createdClient.displayName,
    phoneNormalized,
    created: true,
    emailSetupEnqueued,
  };
}

function zEmailSafe(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}
