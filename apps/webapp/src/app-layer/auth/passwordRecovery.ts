import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { startEmailChallenge, type EmailChallengePurpose } from '@/modules/auth/emailAuth';
import { platformMailProfileForRecipientRole } from '@/modules/auth/mailProfile';
import { OTP_RESEND_COOLDOWN_SEC } from '@/modules/auth/otpConstants';

export const PASSWORD_RECOVERY_REQUEST_ACCEPTED = {
  ok: true,
  retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC,
} as const;

type PasswordRecoveryRequestKind = 'forgot' | 'setup_resend';

/**
 * Starts the applicable recovery challenge without exposing the account state to the HTTP caller.
 * Delivery deliberately continues after the neutral response has been formed, so DB/mail latency
 * cannot become the replacement account-state oracle.
 */
export async function requestPasswordRecoveryChallenge(
  emailNormalized: string,
  kind: PasswordRecoveryRequestKind,
): Promise<void> {
  const deps = buildAppDeps();
  const state = await deps.emailPasswordLookup.resolveAuthState(emailNormalized);
  let candidate: { userId: string; purpose: EmailChallengePurpose } | null = null;
  if (state.kind === 'needs_email_setup') {
    candidate = { userId: state.userId, purpose: 'password_setup' };
  } else if (kind === 'forgot' && state.kind === 'verified_with_password') {
    candidate = { userId: state.userId, purpose: 'password_reset' };
  }
  if (!candidate) return;

  void (async () => {
    enterStaffSecuritySelfPrincipal(
      candidate.userId,
      `api/auth/email-password/${kind}:recovery-candidate-profile`,
    );
    const recipient = await deps.userByPhone.findByUserId(candidate.userId);
    stampBootstrapPrincipal(`api/auth/email-password/${kind}:challenge`);
    if (!recipient) return;
    const result = await startEmailChallenge(
      candidate.userId,
      emailNormalized,
      candidate.purpose,
      platformMailProfileForRecipientRole(recipient.role),
    );
    if (!result.ok) {
      logger.warn(
        { route: `auth/email-password/${kind}`, outcome: 'email_delivery_failed' },
        `auth/email-password/${kind} delivery failed`,
      );
    }
  })().catch(() => {
    logger.warn(
      { route: `auth/email-password/${kind}`, outcome: 'email_delivery_exception' },
      `auth/email-password/${kind} delivery failed`,
    );
  });
}
