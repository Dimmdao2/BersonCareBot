/**
 * Port interface for the public (unauthenticated) email-OTP login flow.
 * DB implementation: infra/repos/pgEmailOtpPublic.ts
 */

export type EmailOtpPublicDbPort = {
  /** Invite-acceptance bootstrap only; ordinary email OTP login must use lookup. */
  findOrCreatePublicEmailUser(emailNorm: string): Promise<{ userId: string; wasCreated: boolean }>;

  /** Lookup only: public login must not create an unknown identity. */
  findPublicEmailUser(emailNorm: string): Promise<{ userId: string } | null>;

  /** Create structured patient registration, preserving an existing pending identity unchanged. */
  registerPublicEmailPatient(input: {
    emailNormalized: string;
    lastName: string;
    firstName: string;
    patronymic: string | null;
  }): Promise<{ ok: true; userId: string; wasCreated: boolean } | { ok: false; reason: "duplicate_email" }>;

  /** Roll back only a newly-created unverified registration after delivery failure. */
  deleteUnverifiedPublicEmailRegistration(userId: string): Promise<void>;

  /**
   * Find most recent unexpired challenge by email (normalized).
   * Used at confirm step when we only know email+code, not userId.
   */
  findLatestEmailChallengeByEmail(
    emailNorm: string,
    nowSec: number,
  ): Promise<{ id: string; user_id: string; code_hash: string; expires_at: string; attempts: string } | null>;

  /**
   * Rate-limit check: most recent cooldown for this email across all users.
   * Anti-enumeration: don't require userId to check cooldown.
   */
  findEmailSendCooldownByEmail(emailNorm: string): Promise<Date | null>;
};
