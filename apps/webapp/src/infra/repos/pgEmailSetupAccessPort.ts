import type {
  EmailSetupAccessPort,
  RequestContactEmailSetupParams,
  RequestContactEmailSetupResult,
} from '@/modules/auth/emailSetupAccess/ports';
import { startEmailChallenge } from '@/modules/auth/emailAuth';
import { platformMailProfileForRecipientRole } from '@/modules/auth/mailProfile';

/** A doctor-created patient's contact email receives a passwordless login code. */
export function createPgEmailSetupAccessPort(): EmailSetupAccessPort {
  return {
    async requestContactEmailSetup(
      params: RequestContactEmailSetupParams,
    ): Promise<RequestContactEmailSetupResult> {
      // Patients never receive a password setup promise. The `login` purpose is consumed by the
      // existing POST /api/auth/email-otp/confirm door and opens the passwordless patient session.
      const started = await startEmailChallenge(
        params.userId,
        params.emailNormalized,
        'login',
        platformMailProfileForRecipientRole('client'),
      );
      if (!started.ok) {
        return { ok: false, reason: 'not_configured' };
      }
      return { ok: true, status: 'enqueued' };
    },
  };
}
