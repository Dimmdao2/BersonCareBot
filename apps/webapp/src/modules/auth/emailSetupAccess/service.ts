import { normalizeEmail } from "@/modules/auth/emailAuth";
import type {
  EmailSetupAccessPort,
  RequestContactEmailSetupParams,
  RequestContactEmailSetupResult,
} from "./ports";

export function createEmailSetupAccessService(port: EmailSetupAccessPort) {
  return {
    async requestContactEmailSetup(
      params: RequestContactEmailSetupParams,
    ): Promise<RequestContactEmailSetupResult> {
      const emailNormalized = normalizeEmail(params.emailNormalized);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized) || emailNormalized.length > 320) {
        return { ok: false, reason: "invalid_email" };
      }
      return port.requestContactEmailSetup({
        ...params,
        emailNormalized,
      });
    },
  };
}

export type EmailSetupAccessService = ReturnType<typeof createEmailSetupAccessService>;
