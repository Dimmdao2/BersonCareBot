/**
 * A-3 — the two halves of "always ask for a code, or a login".
 *
 * `issuePublicBookingVerification` validates and tenant-binds the booking, pins it server-side and
 * sends a one-time code. It performs **no lookup keyed on the contact**, which is what makes its
 * response uniform on match and no-match *by construction* rather than by padding (ASVS 5.0 6.3.8,
 * CWE-204): there is no data-dependent branch to observe, in the body, the status or the timing.
 *
 * `completeVerifiedPublicBooking` runs only after the code verified. Everything that used to leak —
 * resolving the person, the blocked-client check, package selection, the paid/unpaid status — now
 * happens on the far side of proof, where the caller is the contact's owner and is entitled to see
 * it.
 *
 * There is deliberately **no slot hold** between the two steps. A hold created by an unverified
 * anonymous request is a slot-locking denial-of-service primitive, which is the very thing ASVS
 * 2.4.1 asks us to bound: with a 10-minute code TTL, the per-IP budget would let a caller freeze a
 * clinic's day without ever proving anything. The slot is instead re-asserted authoritatively at
 * confirm — `assertSlotAvailable` plus the `be_appointments_specialist_no_overlap` exclusion
 * constraint — so a lost race fails cleanly as `slot_overlap`, exactly as two simultaneous
 * confirmed bookings already do today.
 */
import { randomBytes } from 'node:crypto';
import type { PhoneChallengePayload } from '@/modules/auth/phoneChallengeStore';
import {
  OTP_LOCK_DURATION_SEC,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SEC,
} from '@/modules/auth/otpConstants';
import { generateSmsCode } from '@/modules/auth/smsCode';
import { normalizeRuPhoneE164 } from '@/shared/phone/normalizeRuPhoneE164';
import { isValidPhoneE164 } from '@/modules/auth/phoneValidation';
import type { PublicBookingOtpPort } from './publicBookingOtpPort';
import {
  channelProvesPhoneControl,
  parsePublicBookingIntent,
  PUBLIC_BOOKING_INTENT_VERSION,
  type PublicBookingIntent,
} from './publicBookingIntent';

/** Code lifetime; the same TTL the rest of the phone-OTP flow uses. */
export const PUBLIC_BOOKING_CHALLENGE_TTL_SEC = 600;

/** Delivery-only seam: "send this code to this number". Owns no storage. */
export type PublicBookingCodeDelivery = (
  phone: string,
  code: string,
) => Promise<{ ok: true } | { ok: false; code?: string }>;

/**
 * Storage is the SECURITY DEFINER accessor port, delivery is a plain function.
 *
 * They used to be one thing — `SmsPort.sendCode`, which gates, stores and sends. That bundle is
 * why this path could not run outside DEV: storing meant `INSERT INTO phone_challenges` from the
 * request's own role, and `deploy/postgres/p0-5b-grants.sql` gives that table to app_staff only,
 * while both booking handlers run as app_patient (bootstrap principal → nonstaff pool). Splitting
 * storage out lets it go through `app.phone_otp_public_booking_*`, which needs no table grant at
 * all. The per-phone cooldown and lockout did not move — they are enforced inside those accessors,
 * against the same two tables, with the same constants passed in from `otpConstants.ts`.
 */
export type PublicBookingVerificationDeps = {
  otp: PublicBookingOtpPort;
  deliverCode: PublicBookingCodeDelivery;
};

export type IssueVerificationResult =
  | { ok: true; challengeId: string; expiresInSeconds: number; retryAfterSeconds?: number }
  | {
      ok: false;
      code: 'auth_channel_disabled' | 'invalid_phone' | 'verification_unavailable';
      retryAfterSeconds?: number;
    };

function generateChallengeId(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * Issues the one-time code and pins `intent` to the resulting challenge.
 *
 * Order note: the challenge is written BEFORE delivery is attempted, which is the reverse of
 * `integratorSmsAdapter`. Deliberate. Gate-then-write has to be one atomic step or two concurrent
 * requests for the same number both pass the resend-cooldown check before either writes a row, and
 * the accessor cannot hold that transaction open across an outbound HTTP call. The cost is that a
 * failed send still consumes the 60-second cooldown for that number. That is invisible to the
 * caller — success and failure return the same constant body either way — and it errs towards
 * fewer codes, not more.
 */
export async function issuePublicBookingVerification(
  deps: PublicBookingVerificationDeps,
  intent: PublicBookingIntent,
): Promise<IssueVerificationResult> {
  // `normalizeRuPhoneE164` returns a string for any input (it answers "+" for garbage), so the
  // shape has to be checked separately — otherwise a nonsense contact would reach code delivery.
  const phone = normalizeRuPhoneE164(intent.contactPhone);
  if (!isValidPhoneE164(phone)) return { ok: false, code: 'invalid_phone' };

  const challengeId = generateChallengeId();
  const code = generateSmsCode();

  const issued = await deps.otp.issueChallenge({
    phone,
    challengeId,
    code,
    ttlSec: PUBLIC_BOOKING_CHALLENGE_TTL_SEC,
    resendCooldownSec: OTP_RESEND_COOLDOWN_SEC,
    deliveryChannel: 'sms',
    intent: { ...intent, v: PUBLIC_BOOKING_INTENT_VERSION },
  });
  // Every limit failure collapses into ONE code. Lockout vs resend cooldown are both observable
  // functions of the phone number, so distinguishing them would rebuild the enumeration oracle one
  // layer down — which is why `issueChallenge` returns a bare boolean and not a reason.
  if (!issued) return { ok: false, code: 'verification_unavailable' };

  const sent = await deps.deliverCode(phone, code);
  if (!sent.ok) {
    return {
      ok: false,
      code:
        sent.code === 'auth_channel_disabled'
          ? 'auth_channel_disabled'
          : 'verification_unavailable',
    };
  }

  return {
    ok: true,
    challengeId,
    expiresInSeconds: PUBLIC_BOOKING_CHALLENGE_TTL_SEC,
    retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC,
  };
}

export type VerifiedIntent = {
  intent: PublicBookingIntent;
  /** Which channel delivered the code that was just entered. */
  deliveryChannel: PhoneChallengePayload['deliveryChannel'];
  /** Did that channel prove control of the phone number on the booking? */
  phoneProven: boolean;
};

export type ConsumeVerificationResult =
  | { ok: true; verified: VerifiedIntent }
  | { ok: false; code: 'verification_failed'; retryAfterSeconds?: number };

/**
 * Verifies the entered code and hands back the pinned intent, once.
 *
 * Expired, unknown, wrong, exhausted and "challenge carries no booking intent" all return the same
 * single failure code: telling them apart lets a caller probe challenge ids and count attempts.
 */
export async function consumePublicBookingVerification(
  deps: PublicBookingVerificationDeps,
  challengeId: string,
  code: string,
): Promise<ConsumeVerificationResult> {
  // One call. The code is compared inside the accessor and the challenge is deleted in the same
  // transaction that accepts it — single use is a database property here, not a sequence of app
  // steps that a concurrent confirm could interleave with. The code is never read back out.
  const consumed = await deps.otp.consumeChallenge(
    challengeId,
    code,
    OTP_MAX_VERIFY_ATTEMPTS,
    OTP_LOCK_DURATION_SEC,
  );
  if (!consumed.ok) {
    return {
      ok: false,
      code: 'verification_failed',
      ...(consumed.retryAfterSeconds == null
        ? {}
        : { retryAfterSeconds: consumed.retryAfterSeconds }),
    };
  }

  // The intent is re-validated on the way out, exactly as it was when it came back through
  // `channelContextFromRow`: an intent of an unknown shape or version is "no intent", not a
  // half-trusted booking.
  const intent = parsePublicBookingIntent(consumed.intent);
  if (!intent) return { ok: false, code: 'verification_failed' };

  return {
    ok: true,
    verified: {
      intent,
      deliveryChannel: consumed.deliveryChannel,
      phoneProven: channelProvesPhoneControl(consumed.deliveryChannel),
    },
  };
}
