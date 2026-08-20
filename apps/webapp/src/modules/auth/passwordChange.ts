import type { SessionUser } from '@/shared/types/session';
import { normalizeEmail } from '@/modules/auth/emailAuth';
import type { UserByPhonePort } from '@/modules/auth/userByPhonePort';
import type { StaffSecurityService } from '@/modules/staff-security/service';
import type {
  PasswordAltchaProof,
  PasswordVerificationResult,
} from '@/modules/auth/passwordLoginProtection';

type PasswordCredentialsPort = {
  tryVerifyLogin(
    emailNormalized: string,
    plainPassword: string,
    altchaProof?: PasswordAltchaProof,
    altchaSubmitted?: boolean,
  ): Promise<PasswordVerificationResult>;
  updatePasswordHash(userId: string, emailNormalized: string, passwordHash: string): Promise<void>;
};

type PasswordChangeDeps = {
  credentials: PasswordCredentialsPort;
  users: Pick<
    UserByPhonePort,
    'getVerifiedEmailForUser' | 'invalidateSessionsForSelf' | 'findByUserId'
  >;
  staffSecurity: Pick<StaffSecurityService, 'getStatus' | 'revokeSessions'>;
  hashPassword: (plainPassword: string) => Promise<string>;
};

export type PasswordChangeResult =
  | { ok: true; user: SessionUser }
  | {
      ok: false;
      error:
        | 'password_login_unavailable'
        | 'wrong_current_password'
        | 'password_temporarily_locked';
      retryAfterSeconds?: number;
      captchaRequired?: boolean;
      captchaRefreshRequired?: boolean;
    };

export function createPasswordChangeService(deps: PasswordChangeDeps) {
  return {
    async changePassword(input: {
      userId: string;
      currentPassword: string;
      newPassword: string;
      altchaProof?: PasswordAltchaProof;
      altchaSubmitted?: boolean;
    }): Promise<PasswordChangeResult> {
      const verifiedEmail = await deps.users.getVerifiedEmailForUser(input.userId);
      if (!verifiedEmail) {
        return { ok: false, error: 'password_login_unavailable' };
      }

      const emailNormalized = normalizeEmail(verifiedEmail);
      const verified = await deps.credentials.tryVerifyLogin(
        emailNormalized,
        input.currentPassword,
        input.altchaProof,
        input.altchaSubmitted,
      );
      if (!verified.ok || verified.userId !== input.userId || !verified.emailVerified) {
        if (!verified.ok) {
          return {
            ok: false,
            error:
              verified.locked
                ? 'password_temporarily_locked'
                : 'wrong_current_password',
            retryAfterSeconds: verified.retryAfterSeconds,
            captchaRequired: verified.captchaRequired,
            captchaRefreshRequired: verified.captchaRefreshRequired,
          };
        }
        return { ok: false, error: 'wrong_current_password' };
      }

      const passwordHash = await deps.hashPassword(input.newPassword);
      const security = await deps.staffSecurity.getStatus();

      // Replace the verified self credential first. Revoking before this write meant a transient
      // credential-store failure signed the caller out everywhere while leaving the old password
      // valid. Once replacement succeeds, rotate both staff-factor challenges (when enrolled) and
      // the canonical session epoch, then re-read the caller for the one replacement cookie.
      await deps.credentials.updatePasswordHash(input.userId, emailNormalized, passwordHash);
      if (security) await deps.staffSecurity.revokeSessions();
      await deps.users.invalidateSessionsForSelf();

      const user = await deps.users.findByUserId(input.userId);
      if (!user) {
        throw new Error('password_change_user_missing_after_session_revocation');
      }
      return { ok: true, user };
    },
  };
}

export type PasswordChangeService = ReturnType<typeof createPasswordChangeService>;
