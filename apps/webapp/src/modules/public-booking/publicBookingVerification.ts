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
import type { PhoneChallengePayload, PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";
import type { PhoneOtpDelivery, SmsPort } from "@/modules/auth/smsPort";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import { isValidPhoneE164 } from "@/modules/auth/phoneValidation";
import {
  channelProvesPhoneControl,
  PUBLIC_BOOKING_INTENT_VERSION,
  type PublicBookingIntent,
} from "./publicBookingIntent";

/** Code lifetime; the same TTL the rest of the phone-OTP flow uses. */
export const PUBLIC_BOOKING_CHALLENGE_TTL_SEC = 600;

export type PublicBookingVerificationDeps = {
  smsPort: SmsPort;
  challengeStore: PhoneChallengeStore;
};

export type IssueVerificationResult =
  | { ok: true; challengeId: string; expiresInSeconds: number; retryAfterSeconds?: number }
  | { ok: false; code: "invalid_phone" | "verification_unavailable"; retryAfterSeconds?: number };

/**
 * Issues the one-time code and pins `intent` to the resulting challenge.
 *
 * Delivery goes through `SmsPort.sendCode`, which is what inherits the per-phone resend cooldown
 * and lockout (`phoneOtpLimits`) instead of growing a second one-time-code system.
 */
export async function issuePublicBookingVerification(
  deps: PublicBookingVerificationDeps,
  intent: PublicBookingIntent,
): Promise<IssueVerificationResult> {
  // `normalizeRuPhoneE164` returns a string for any input (it answers "+" for garbage), so the
  // shape has to be checked separately — otherwise a nonsense contact would reach code delivery.
  const phone = normalizeRuPhoneE164(intent.contactPhone);
  if (!isValidPhoneE164(phone)) return { ok: false, code: "invalid_phone" };

  const delivery: PhoneOtpDelivery = { channel: "sms" };
  const sent = await deps.smsPort.sendCode(phone, PUBLIC_BOOKING_CHALLENGE_TTL_SEC, delivery);
  if (!sent.ok) {
    // Every delivery/limit failure collapses into ONE code. `rate_limited` vs `delivery_failed` vs
    // `too_many_attempts` are all observable functions of the phone number, so distinguishing them
    // would rebuild the enumeration oracle one layer down.
    return {
      ok: false,
      code: "verification_unavailable",
      retryAfterSeconds: sent.retryAfterSeconds,
    };
  }

  const stored = await deps.challengeStore.get(sent.challengeId);
  if (!stored) return { ok: false, code: "verification_unavailable" };
  await deps.challengeStore.set(sent.challengeId, {
    ...stored,
    publicBookingIntent: { ...intent, v: PUBLIC_BOOKING_INTENT_VERSION },
  });

  return {
    ok: true,
    challengeId: sent.challengeId,
    expiresInSeconds: PUBLIC_BOOKING_CHALLENGE_TTL_SEC,
    retryAfterSeconds: sent.retryAfterSeconds,
  };
}

export type VerifiedIntent = {
  intent: PublicBookingIntent;
  /** Which channel delivered the code that was just entered. */
  deliveryChannel: PhoneChallengePayload["deliveryChannel"];
  /** Did that channel prove control of the phone number on the booking? */
  phoneProven: boolean;
};

export type ConsumeVerificationResult =
  | { ok: true; verified: VerifiedIntent }
  | { ok: false; code: "verification_failed"; retryAfterSeconds?: number };

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
  const stored = await deps.challengeStore.get(challengeId);
  if (!stored?.publicBookingIntent) {
    return { ok: false, code: "verification_failed" };
  }

  const verified = await deps.smsPort.verifyCode(challengeId, code);
  if (!verified.ok) {
    return {
      ok: false,
      code: "verification_failed",
      retryAfterSeconds: verified.retryAfterSeconds,
    };
  }

  // Single use: the code is spent whether or not the booking below succeeds. A challenge that
  // survived a successful verify would let one code be replayed into many bookings.
  await deps.challengeStore.delete(challengeId);

  return {
    ok: true,
    verified: {
      intent: stored.publicBookingIntent,
      deliveryChannel: stored.deliveryChannel,
      phoneProven: channelProvesPhoneControl(stored.deliveryChannel),
    },
  };
}
