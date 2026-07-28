import type {
  EmailSetupAccessPort,
  RequestContactEmailSetupParams,
  RequestContactEmailSetupResult,
} from '@/modules/auth/emailSetupAccess/ports';
import type { EmailSetupTokensPort } from '@/modules/auth/emailSetupTokens/ports';
import { startEmailChallenge } from '@/modules/auth/emailAuth';

/** `tokensPort` оставлен в сигнатуре для совместимости composition root; setup теперь кодовый. */
export function createPgEmailSetupAccessPort(
  tokensPort: EmailSetupTokensPort,
): EmailSetupAccessPort {
  void tokensPort;

  return {
    async requestContactEmailSetup(
      params: RequestContactEmailSetupParams,
    ): Promise<RequestContactEmailSetupResult> {
      // Contact-only email setup access for a doctor/admin-created client is
      // confirmed through the same POST /api/auth/email-password/setup-code/complete as
      // email-password/setup-access and email-password/forgot's needs_email_setup branch --
      // "password_setup" purpose (C-2 step 4).
      const started = await startEmailChallenge(
        params.userId,
        params.emailNormalized,
        'password_setup',
      );
      if (!started.ok) {
        return { ok: false, reason: 'not_configured' };
      }
      return { ok: true, status: 'enqueued' };
    },
  };
}
