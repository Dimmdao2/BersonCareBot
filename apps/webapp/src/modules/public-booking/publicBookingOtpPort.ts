/**
 * A-3 — the database seam the anonymous booking OTP path uses.
 *
 * Two operations, mirroring the two SECURITY DEFINER accessors in
 * `0246_public_booking_phone_otp_accessors.sql`. The shape is dictated by one rule: the code is
 * never read back out of the database. It goes IN on issue and IN on consume, and the comparison
 * happens inside the accessor — exactly as `EmailOtpPublicDbPort.consumeLatestEmailChallenge` sends
 * a hash in and gets a verdict out, never a row.
 *
 * That is why there is no `get`. The anonymous booking path never needs to read a challenge; it
 * needs to create one and to spend one. A read accessor would hand the plaintext one-time code of
 * any outstanding challenge to the anonymous role — including staff login challenges, which live in
 * the same table.
 */
import type { PhoneChallengePayload } from "@/modules/auth/phoneChallengeStore";
import type { PublicBookingIntent } from "./publicBookingIntent";

export type PublicBookingOtpIssueInput = {
  /** Normalised E.164 number the code is being sent to. */
  phone: string;
  challengeId: string;
  code: string;
  ttlSec: number;
  /** `OTP_RESEND_COOLDOWN_SEC` — passed in so the constant lives in one place, not also in SQL. */
  resendCooldownSec: number;
  deliveryChannel: NonNullable<PhoneChallengePayload["deliveryChannel"]>;
  intent: PublicBookingIntent;
};

export type PublicBookingOtpConsumeResult =
  | {
      ok: true;
      /** Raw pinned intent; the caller re-validates it with `parsePublicBookingIntent`. */
      intent: unknown;
      deliveryChannel: PhoneChallengePayload["deliveryChannel"];
    }
  | { ok: false; retryAfterSeconds?: number };

export type PublicBookingOtpPort = {
  /**
   * Gate (per-phone lockout + resend cooldown) and create the challenge, atomically.
   * `false` covers every refusal without saying which — the caller has nothing to do with the
   * difference, and the difference is a fact about the phone number.
   */
  issueChallenge(input: PublicBookingOtpIssueInput): Promise<boolean>;

  /**
   * Verify the code and spend the challenge. Every failure — unknown id, expired, wrong code,
   * attempts exhausted, challenge carries no booking intent — returns the same `ok: false`.
   */
  consumeChallenge(
    challengeId: string,
    code: string,
    maxAttempts: number,
    lockDurationSec: number,
  ): Promise<PublicBookingOtpConsumeResult>;
};
