import { webappReposAreInMemory } from "@/config/env";
import type { PhoneOtpLimitsDbPort } from "@/modules/auth/phoneOtpLimitsPort";
import type { PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";
import {
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SEC,
  nextOtpLockoutDurationSeconds,
} from "@/modules/auth/otpConstants";
import type { SendCodeResult, VerifyCodeResult } from "@/modules/auth/smsPort";

export type PhoneChallengeGateResult = SendCodeResult | { ok: true };

const nowSec = () => Math.floor(Date.now() / 1000);

let phoneOtpLimitsDbPort: PhoneOtpLimitsDbPort | undefined;

export function bindPhoneOtpLimitsDbPort(port: PhoneOtpLimitsDbPort): void {
  phoneOtpLimitsDbPort = port;
}

function requirePhoneOtpDb(): PhoneOtpLimitsDbPort {
  if (!phoneOtpLimitsDbPort) {
    throw new Error("PhoneOtpLimitsDbPort is not bound. Call ensureAuthModulePortsBound().");
  }
  return phoneOtpLimitsDbPort;
}

/** In-memory: только Vitest без `DATABASE_URL`. */
const memLocks = new Map<string, number>();
/** Decaying lockout cycle count per phone (night plan C-2 step 3), in-memory mirror of the DB's
 * `lockout_cycle` column. Deliberately NOT cleared just because a lock's `locked_until` is in the
 * past -- only a successful verification resets it (NIST SP 800-63B §5.2.2), same as the DB path. */
const memLockCycles = new Map<string, number>();
const memLastSend = new Map<string, number>();

export async function assertPhoneCanStartChallenge(phone: string): Promise<PhoneChallengeGateResult> {
  const n = phone;
  if (webappReposAreInMemory()) {
    const lockedUntil = memLocks.get(n);
    if (lockedUntil != null && lockedUntil > nowSec()) {
      return {
        ok: false,
        code: "too_many_attempts",
        retryAfterSeconds: Math.max(1, lockedUntil - nowSec()),
      };
    }
    const last = memLastSend.get(n);
    if (last != null && nowSec() - last < OTP_RESEND_COOLDOWN_SEC) {
      return {
        ok: false,
        code: "rate_limited",
        retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC - (nowSec() - last),
      };
    }
    return { ok: true };
  }

  const db = requirePhoneOtpDb();
  const lockRow = await db.findLock(n);
  if (lockRow) {
    const lu = Number(lockRow.locked_until);
    if (lu > nowSec()) {
      return {
        ok: false,
        code: "too_many_attempts",
        retryAfterSeconds: Math.max(1, lu - nowSec()),
      };
    }
  }

  const maxCreated = await db.findLatestChallengeCreatedAt(n);
  if (maxCreated) {
    const delta = Math.floor((Date.now() - new Date(maxCreated).getTime()) / 1000);
    if (delta < OTP_RESEND_COOLDOWN_SEC) {
      return {
        ok: false,
        code: "rate_limited",
        retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC - delta,
      };
    }
  }

  return { ok: true };
}

export async function registerPhoneSend(phone: string): Promise<void> {
  if (webappReposAreInMemory()) {
    memLastSend.set(phone, nowSec());
  }
}

export async function onPhoneWrongCode(
  phone: string,
  challengeId: string,
  challengeStore: PhoneChallengeStore
): Promise<VerifyCodeResult> {
  const stored = await challengeStore.get(challengeId);
  if (!stored) {
    return { ok: false, code: "expired_code" };
  }

  // Atomic: the store computes verifyAttempts + 1 itself in one round trip (never a full-payload
  // `set({...stored, verifyAttempts})` overwrite, which was a blind `ON CONFLICT DO UPDATE SET
  // verify_attempts = EXCLUDED.verify_attempts` -- a genuine lost update under concurrent wrong-code
  // submissions for the same challenge, not merely a race window).
  const attempts = await challengeStore.incrementVerifyAttempts(challengeId);
  if (attempts == null) {
    // The challenge vanished between the read above and this increment (e.g. a concurrent resend,
    // expiry cleanup, or a second confirm that already succeeded and deleted it) -- treat exactly
    // like "no such challenge", never "invalid code" against a challenge that no longer exists.
    return { ok: false, code: "expired_code" };
  }

  if (attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    await challengeStore.delete(challengeId);
    let lockedUntil: number;
    if (webappReposAreInMemory()) {
      // Same formula/citations as pgPhoneOtpLimits.ts:registerPhoneOtpLockout /
      // app.email_auth_register_email_otp_lockout: escalate from the cycle count already on record
      // for this phone (0 if never locked, or reset by a success), not from the flat constant.
      const previousCycles = memLockCycles.get(phone) ?? 0;
      const duration = nextOtpLockoutDurationSeconds(previousCycles);
      lockedUntil = nowSec() + duration;
      memLockCycles.set(phone, previousCycles + 1);
      memLocks.set(phone, lockedUntil);
    } else {
      lockedUntil = await requirePhoneOtpDb().registerLockout(phone, nowSec());
    }
    return {
      ok: false,
      code: "too_many_attempts",
      retryAfterSeconds: Math.max(1, lockedUntil - nowSec()),
    };
  }

  return { ok: false, code: "invalid_code" };
}

/**
 * NIST SP 800-63B §5.2.2: disregard any previous failed attempts after a successful
 * authentication. Called by the SMS adapters right after a code verifies -- resets the escalation
 * cycle so the next lockout (if any) starts short again, at 2 minutes.
 */
export async function registerPhoneVerifySuccess(phone: string): Promise<void> {
  if (webappReposAreInMemory()) {
    memLocks.delete(phone);
    memLockCycles.delete(phone);
    return;
  }
  await requirePhoneOtpDb().resetLockout(phone);
}
