import type { EmailSetupAccessSource } from "@/modules/auth/emailSetupAccess/ports";
import type { EmailSetupAccessService } from "@/modules/auth/emailSetupAccess/service";

export async function requestEmailSetupAccessForUser(
  emailSetupAccess: EmailSetupAccessService,
  params: {
    userId: string;
    emailNormalized: string;
    source: EmailSetupAccessSource;
    createdByUserId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: "email_send_failed" | "not_configured" }> {
  const sent = await emailSetupAccess.requestContactEmailSetup(params);
  if (sent.ok && sent.status === "enqueued") {
    return { ok: true };
  }
  return { ok: false, error: "not_configured" };
}
