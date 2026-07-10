/**
 * Port interface for the public (unauthenticated) email-OTP login flow.
 * DB implementation: infra/repos/pgEmailOtpPublic.ts
 */

export type EmailOtpPublicDbPort = {
  /**
   * Find existing user by email_normalized, or create a new 'client' row with that email (unverified).
   * Safe to call multiple times — returns existing userId if already exists.
   */
  findOrCreatePublicEmailUser(emailNorm: string): Promise<{ userId: string; wasCreated: boolean }>;

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
