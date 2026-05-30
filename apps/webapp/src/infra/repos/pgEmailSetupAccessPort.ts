import type {
  EmailSetupAccessPort,
  RequestContactEmailSetupParams,
  RequestContactEmailSetupResult,
} from "@/modules/auth/emailSetupAccess/ports";
import type { EmailSetupTokensPort } from "@/modules/auth/emailSetupTokens/ports";
import { startEmailChallenge } from "@/modules/auth/emailAuth";

/** `tokensPort` оставлен в сигнатуре для совместимости composition root; setup теперь кодовый. */
export function createPgEmailSetupAccessPort(tokensPort: EmailSetupTokensPort): EmailSetupAccessPort {
  void tokensPort;

  return {
    async requestContactEmailSetup(
      params: RequestContactEmailSetupParams,
    ): Promise<RequestContactEmailSetupResult> {
      const started = await startEmailChallenge(params.userId, params.emailNormalized);
      if (!started.ok) {
        return { ok: false, reason: "not_configured" };
      }
      return { ok: true, status: "enqueued" };
    },
  };
}
