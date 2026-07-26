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
   * Atomically consume the latest challenge using only a pre-hashed code.
   * C-2 step 4: the DB function itself now enforces that the row's purpose is one of
   * 'login' / 'public_registration' / 'clinic_invite' -- the three purposes that share this one
   * anonymous engine across POST /api/auth/email-otp/confirm and
   * POST /api/clinic/invites/accept/confirm (see migration 0249's header for why that allow-list is
   * hardcoded in the function body rather than a caller-supplied argument, and for the residual
   * login-vs-clinic_invite gap this does not close).
   */
  consumeLatestEmailChallenge(
    emailNorm: string,
    codeHash: string,
  ): Promise<
    | { ok: true; userId: string }
    | {
        ok: false;
        code: "invalid_code" | "expired_code" | "too_many_attempts" | "email_conflict";
        retryAfterSeconds?: number;
      }
  >;

  /**
   * Rate-limit check: most recent cooldown for this email across all users.
   * Anti-enumeration: don't require userId to check cooldown.
   */
  findEmailSendCooldownByEmail(emailNorm: string): Promise<Date | null>;
};
