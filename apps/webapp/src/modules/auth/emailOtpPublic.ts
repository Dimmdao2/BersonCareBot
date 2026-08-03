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

import { randomUUID } from 'node:crypto';
import { startEmailChallenge, normalizeEmail, hashEmailChallengeCode } from './emailAuth';
import { OTP_RESEND_COOLDOWN_SEC } from './otpConstants';
import type { EmailOtpPublicDbPort } from './emailOtpPublicPort';
import { normalizeFioPart } from '@/shared/lib/fio';

export type StartPublicEmailOtpResult =
  | {
      ok: true;
      challengeId: string;
      retryAfterSeconds?: number;
      /** Server-only delivery evidence; the public route must not expose it. */
      deliveryFailed?: true;
    }
  | {
      ok: false;
      code: 'invalid_email' | 'rate_limited';
      retryAfterSeconds?: number;
    };

export type StartPublicEmailOtpRegistrationResult =
  | StartPublicEmailOtpResult
  | { ok: false; code: 'duplicate_email' | 'invalid_fio' | 'email_send_failed' | 'too_many_attempts' };

export type ConfirmPublicEmailOtpResult =
  /** No redirectTo here on purpose: the route loads the DB base role, then may apply the fresh session-only email-admin policy. */
  | { ok: true; userId: string }
  | {
      ok: false;
      code: 'invalid_code' | 'expired_code' | 'too_many_attempts' | 'email_conflict';
      retryAfterSeconds?: number;
    };

/**
 * Start a public email-OTP challenge.
 * Steps:
 *  1. Normalize & validate email.
 *  2. Rate-limit by email (anti-enumeration: same shape for known/unknown).
 *  3. Find an existing user only. Unknown addresses get the same successful
 *     response shape without an identity or delivered challenge.
 *  4. Delegate to startEmailChallenge (existing infra: code gen, hash, DB insert, send).
 *     Delivery and per-user lock failures become the same neutral success-shaped result as an
 *     unknown address; `deliveryFailed` is server-only observability evidence.
 */
export async function startPublicEmailOtpChallenge(
  emailRaw: string,
  publicDb: EmailOtpPublicDbPort,
): Promise<StartPublicEmailOtpResult> {
  const email = normalizeEmail(emailRaw);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: 'invalid_email' };
  }

  // Rate-limit: check by email (no userId needed yet — anti-enumeration).
  const lastSent = await publicDb.findEmailSendCooldownByEmail(email);
  if (lastSent) {
    const deltaSec = Math.floor((Date.now() - new Date(lastSent).getTime()) / 1000);
    if (deltaSec < OTP_RESEND_COOLDOWN_SEC) {
      return {
        ok: false,
        code: 'rate_limited',
        retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC - deltaSec,
      };
    }
  }

  const user = await publicDb.findPublicEmailUser(email);
  if (!user) {
    return { ok: true, challengeId: randomUUID(), retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC };
  }

  // Delegate to existing startEmailChallenge (handles code gen, hash, DB insert, send, per-user cooldown).
  const result = await startEmailChallenge(user.userId, email, 'login');
  if (result.ok) return result;
  if (result.code === 'rate_limited') {
    return {
      ok: false,
      code: 'rate_limited',
      ...(result.retryAfterSeconds == null
        ? {}
        : { retryAfterSeconds: result.retryAfterSeconds }),
    };
  }

  // A public caller must not learn whether a valid address has an account from a provider outage
  // or a per-user lockout. Keep the actual provider failure as a server-only outcome for the route
  // logger, but make the public result indistinguishable from an unknown address.
  return {
    ok: true,
    challengeId: randomUUID(),
    retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC,
    ...(result.code === 'email_send_failed' ? { deliveryFailed: true as const } : {}),
  };
}

/** Start a distinct structured patient email-registration flow. */
export async function startPublicEmailOtpRegistration(
  input: { email: string; lastName: string; firstName: string; patronymic?: string | null },
  publicDb: EmailOtpPublicDbPort,
): Promise<StartPublicEmailOtpRegistrationResult> {
  const email = normalizeEmail(input.email);
  const lastName = normalizeFioPart(input.lastName);
  const firstName = normalizeFioPart(input.firstName);
  const patronymic = normalizeFioPart(input.patronymic) || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: 'invalid_email' };
  }
  if (!lastName || !firstName) return { ok: false, code: 'invalid_fio' };

  const lastSent = await publicDb.findEmailSendCooldownByEmail(email);
  if (lastSent) {
    const deltaSec = Math.floor((Date.now() - new Date(lastSent).getTime()) / 1000);
    if (deltaSec < OTP_RESEND_COOLDOWN_SEC) {
      return {
        ok: false,
        code: 'rate_limited',
        retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC - deltaSec,
      };
    }
  }

  const registration = await publicDb.registerPublicEmailPatient({
    emailNormalized: email,
    lastName,
    firstName,
    patronymic,
  });
  if (!registration.ok) return { ok: false, code: registration.reason };

  // Keep a newly-created row when delivery fails. `registerPublicEmailPatient` already treats an
  // unverified structured client as a pending registration and returns the same identity on retry
  // without overwriting its FIO. Deleting here defeated that pending contract and forced the person
  // to enter identity data again after an infrastructure failure.
  return startEmailChallenge(registration.userId, email, 'public_registration');
}

/**
 * Confirm a public email-OTP code.
 * The database atomically locks, rechecks, verifies, claims and consumes the latest
 * challenge. It receives only the shared hash, never the raw OTP.
 */
export async function confirmPublicEmailOtpChallenge(
  emailRaw: string,
  codeRaw: string,
  publicDb: EmailOtpPublicDbPort,
): Promise<ConfirmPublicEmailOtpResult> {
  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: false, code: 'expired_code' };

  const code = codeRaw.trim();
  if (!code) return { ok: false, code: 'invalid_code' };

  return publicDb.consumeLatestEmailChallenge(email, hashEmailChallengeCode(code));
}
