/**
 * Public (unauthenticated) email-OTP login flow.
 *
 * Mirrors the phone OTP flow shape:
 *   - start  → find-or-create user → startEmailChallenge (reuses existing challenge infra)
 *   - confirm → find challenge by email → confirmEmailChallenge → return userId for session
 *
 * Anti-enumeration: start always returns the same response shape regardless of whether the
 * email exists in the DB.  The only distinguishing error is rate_limited (timing-only).
 */

import { startEmailChallenge, normalizeEmail, confirmEmailChallenge } from "./emailAuth";
import { OTP_RESEND_COOLDOWN_SEC } from "./otpConstants";
import type { EmailOtpPublicDbPort } from "./emailOtpPublicPort";
import { getRedirectPathForRole } from "./redirectPolicy";

export type StartPublicEmailOtpResult =
  | { ok: true; challengeId: string; retryAfterSeconds?: number }
  | {
      ok: false;
      code: "invalid_email" | "rate_limited" | "email_send_failed" | "too_many_attempts";
      retryAfterSeconds?: number;
    };

export type ConfirmPublicEmailOtpResult =
  | { ok: true; userId: string; redirectTo: string }
  | { ok: false; code: "invalid_code" | "expired_code" | "too_many_attempts" | "email_conflict"; retryAfterSeconds?: number };

/**
 * Start a public email-OTP challenge.
 * Steps:
 *  1. Normalize & validate email.
 *  2. Rate-limit by email (anti-enumeration: same shape for known/unknown).
 *  3. Find existing user OR create provisional 'client' row.
 *  4. Delegate to startEmailChallenge (existing infra: code gen, hash, DB insert, send).
 */
export async function startPublicEmailOtpChallenge(
  emailRaw: string,
  publicDb: EmailOtpPublicDbPort,
): Promise<StartPublicEmailOtpResult> {
  const email = normalizeEmail(emailRaw);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: "invalid_email" };
  }

  // Rate-limit: check by email (no userId needed yet — anti-enumeration).
  const lastSent = await publicDb.findEmailSendCooldownByEmail(email);
  if (lastSent) {
    const deltaSec = Math.floor((Date.now() - new Date(lastSent).getTime()) / 1000);
    if (deltaSec < OTP_RESEND_COOLDOWN_SEC) {
      return { ok: false, code: "rate_limited", retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC - deltaSec };
    }
  }

  // Resolve or create user (needed for FK in email_challenges table).
  const { userId } = await publicDb.findOrCreatePublicEmailUser(email);

  // Delegate to existing startEmailChallenge (handles code gen, hash, DB insert, send, per-user cooldown).
  return startEmailChallenge(userId, email);
}

/**
 * Confirm a public email-OTP code.
 * Steps:
 *  1. Find the latest unexpired challenge for this email.
 *  2. Verify via confirmEmailChallenge (handles attempts, expiry, verifies email on success).
 *  3. Return userId for session creation.
 */
export async function confirmPublicEmailOtpChallenge(
  emailRaw: string,
  codeRaw: string,
  publicDb: EmailOtpPublicDbPort,
): Promise<ConfirmPublicEmailOtpResult> {
  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: false, code: "expired_code" };

  const code = codeRaw.trim();
  if (!code) return { ok: false, code: "invalid_code" };

  const nowSec = Math.floor(Date.now() / 1000);
  const row = await publicDb.findLatestEmailChallengeByEmail(email, nowSec);
  if (!row) return { ok: false, code: "expired_code" };

  // confirmEmailChallenge verifies attempts, checks expiry, sets email_verified_at on success.
  const result = await confirmEmailChallenge(row.user_id, row.id, code);
  if (!result.ok) {
    // EmailConfirmResult error codes map directly to our public codes.
    return result;
  }

  return {
    ok: true,
    userId: row.user_id,
    redirectTo: getRedirectPathForRole("client"),
  };
}
