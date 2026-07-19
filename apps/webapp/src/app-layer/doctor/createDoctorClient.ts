import type { EmailSetupAccessService } from "@/modules/auth/emailSetupAccess/service";

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
  _input: CreateDoctorClientInput,
  _emailSetupAccess: Pick<EmailSetupAccessService, "requestContactEmailSetup">,
): Promise<CreateDoctorClientResult> {
  // This helper writes a global platform identity and has no enrollment writer.
  // Manual organization-scoped creation belongs to U3B; callers must fail closed.
  return { ok: false, error: "create_failed" };
}
