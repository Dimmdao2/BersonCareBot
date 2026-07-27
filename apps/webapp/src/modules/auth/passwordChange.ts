import type { SessionUser } from "@/shared/types/session";
import { normalizeEmail } from "@/modules/auth/emailAuth";
import type { UserByPhonePort } from "@/modules/auth/userByPhonePort";
import type { StaffSecurityService } from "@/modules/staff-security/service";

type PasswordCredentialsPort = {
  tryVerifyLogin(emailNormalized: string, plainPassword: string): Promise<{ userId: string } | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
};

type PasswordChangeDeps = {
  credentials: PasswordCredentialsPort;
  users: Pick<
    UserByPhonePort,
    "getVerifiedEmailForUser" | "invalidateSessionsForSelf" | "findByUserId"
  >;
  staffSecurity: Pick<StaffSecurityService, "getStatus" | "revokeSessions">;
  hashPassword: (plainPassword: string) => Promise<string>;
};

export type PasswordChangeResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: "password_login_unavailable" | "wrong_current_password" };

export function createPasswordChangeService(deps: PasswordChangeDeps) {
  return {
    async changePassword(input: {
      userId: string;
      currentPassword: string;
      newPassword: string;
    }): Promise<PasswordChangeResult> {
      const verifiedEmail = await deps.users.getVerifiedEmailForUser(input.userId);
      if (!verifiedEmail) {
        return { ok: false, error: "password_login_unavailable" };
      }

      const verified = await deps.credentials.tryVerifyLogin(
        normalizeEmail(verifiedEmail),
        input.currentPassword,
      );
      if (verified?.userId !== input.userId) {
        return { ok: false, error: "wrong_current_password" };
      }

      const passwordHash = await deps.hashPassword(input.newPassword);
      const security = await deps.staffSecurity.getStatus();

      // OWASP ASVS session management and NIST SP 800-63B treat a password change as a
      // compromise-remediation event: revoke every previously issued session. Reuse the repository's
      // one revocation mechanism (`platform_users.session_epoch`), then re-read the caller so the
      // replacement cookie can carry the new epoch and remain alive.
      if (security) await deps.staffSecurity.revokeSessions();
      await deps.users.invalidateSessionsForSelf();
      await deps.credentials.updatePasswordHash(input.userId, passwordHash);

      const user = await deps.users.findByUserId(input.userId);
      if (!user) {
        throw new Error("password_change_user_missing_after_session_revocation");
      }
      return { ok: true, user };
    },
  };
}

export type PasswordChangeService = ReturnType<typeof createPasswordChangeService>;
