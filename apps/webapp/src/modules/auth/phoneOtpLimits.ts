import { webappReposAreInMemory } from "@/config/env";
import type { PhoneOtpLimitsDbPort } from "@/modules/auth/phoneOtpLimitsPort";
import type { PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";
import {
  OTP_LOCK_DURATION_SEC,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SEC,
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
    if (lockedUntil != null && lockedUntil <= nowSec()) {
      memLocks.delete(n);
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
  await db.deleteExpiredLocks(nowSec());

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

  const attempts = (stored.verifyAttempts ?? 0) + 1;
  await challengeStore.set(challengeId, { ...stored, verifyAttempts: attempts });

  if (attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    await challengeStore.delete(challengeId);
    const lockUntil = nowSec() + OTP_LOCK_DURATION_SEC;
    if (webappReposAreInMemory()) {
      memLocks.set(phone, lockUntil);
    } else {
      await requirePhoneOtpDb().upsertLock(phone, lockUntil);
    }
    return {
      ok: false,
      code: "too_many_attempts",
      retryAfterSeconds: OTP_LOCK_DURATION_SEC,
    };
  }

  return { ok: false, code: "invalid_code" };
}
