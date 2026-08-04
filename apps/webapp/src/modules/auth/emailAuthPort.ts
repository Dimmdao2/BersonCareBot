/**
 * C-2 step 4 (OWASP ASVS V6.6.2 / NIST SP 800-63B §5.1.3): the intent an email challenge was minted
 * for. One purpose per `startEmailChallenge` caller, matching the confirm engine that legitimately
 * consumes it -- see migration 0249_email_challenge_purpose_binding.sql for the full mapping.
 * 'login' and 'public_registration' both flow through the same anonymous
 * POST /api/auth/email-otp/confirm (no way to tell them apart at that layer), and 'clinic_invite'
 * shares that same DB engine via POST /api/clinic/invites/accept/confirm.
 */
export type EmailChallengePurpose =
  | 'login'
  | 'public_registration'
  | 'clinic_invite'
  | 'specialist_signup'
  | 'password_reset'
  | 'password_setup'
  | 'password_register'
  | 'email_verify'
  | 'patient_email_change';

export type EmailChallengeRow = {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: string;
  /** NULL for rows minted before 0249 -- treated as "legacy, accept once" by the caller. */
  purpose: string | null;
};

export type EmailChallengeCodeRow = {
  id: string;
  code_hash: string;
  expires_at: string;
  attempts: string;
  /** NULL for rows minted before 0249 -- treated as "legacy, accept once" by the caller. */
  purpose: string | null;
};

export type ClaimVerifiedEmailResult =
  | { ok: true; merged: boolean }
  | { ok: false; code: 'email_conflict' };

export type ClaimVerifiedEmailOptions = {
  /** Server-resolved organization scope used only for an authenticated profile merge. */
  profileBindOrganizationId?: string;
};

export type EmailAuthDbPort = {
  findEmailSendCooldown: (userId: string, emailNormalized: string) => Promise<Date | null>;
  deleteEmailChallengesForUser: (userId: string) => Promise<void>;
  insertEmailChallenge: (params: {
    userId: string;
    email: string;
    codeHash: string;
    expiresAt: number;
    purpose: EmailChallengePurpose;
    /**
     * D27-C fix round 2: plaintext OTP, stamped onto the new row (email_challenges.
     * pending_delivery_code) right after insert -- same request, same idiom as the purpose stamp
     * immediately below it. Delivery composes the email from this column instead of accepting it
     * as a caller-supplied payload (app.email_auth_enqueue_otp_delivery, migration 0363).
     */
    code: string;
  }) => Promise<string>;
  deleteEmailChallengeById: (challengeId: string) => Promise<void>;
  upsertEmailSendCooldown: (userId: string, emailNormalized: string) => Promise<void>;
  findEmailChallengeForConfirm: (
    challengeId: string,
    userId: string,
  ) => Promise<EmailChallengeRow | null>;
  /**
   * Atomic wrong-attempt increment: the database computes `attempts + 1` itself (see
   * `app.email_auth_increment_email_challenge_attempts`, migration 0247) — the caller never passes
   * a pre-computed absolute value, which is what made the old `updateEmailChallengeAttempts`
   * susceptible to a lost update under concurrent wrong-code confirms. Returns null if the
   * challenge no longer exists.
   */
  incrementEmailChallengeAttempts: (challengeId: string) => Promise<number | null>;
  findEmailOwnerConflict: (userId: string, email: string) => Promise<boolean>;
  verifyUserEmail: (userId: string, email: string) => Promise<void>;
  /** Verify a free email or safely merge its sole account owner into the current patient. */
  claimVerifiedEmail: (
    userId: string,
    email: string,
    options?: ClaimVerifiedEmailOptions,
  ) => Promise<ClaimVerifiedEmailResult>;
  findEmailChallengeForConsume: (
    challengeId: string,
    userId: string,
  ) => Promise<EmailChallengeCodeRow | null>;
  findLatestEmailChallengeForUser: (
    userId: string,
    nowSec: number,
  ) => Promise<EmailChallengeCodeRow | null>;
  /** Returns the latest unexpired challenge for a user, including the pending email address. */
  findLatestPendingEmailChallengeForUser: (
    userId: string,
    nowSec: number,
  ) => Promise<EmailChallengeRow | null>;
  /**
   * Decaying OTP lockout (night plan C-2 step 3): read-only gate check for `startEmailChallenge`.
   * Returns the current `locked_until` epoch second for this user, or null if never locked / reset.
   */
  findEmailOtpLock: (userId: string) => Promise<{ locked_until: string | number } | null>;
  /**
   * Atomically escalates this user's lockout cycle (120s, 240s, 480s, 960s, capped at 1800s -- see
   * otpConstants.ts:nextOtpLockoutDurationSeconds) and returns the new locked_until epoch second.
   */
  registerEmailOtpLockout: (userId: string) => Promise<number>;
  /**
   * NIST SP 800-63B §5.2.2: disregard previous failed attempts after a successful verification.
   */
  resetEmailOtpLockout: (userId: string) => Promise<void>;
};
