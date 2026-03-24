import { getPool } from "@/infra/db/client";
import { env } from "@/config/env";
import type { PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";
import {
  OTP_LOCK_DURATION_SEC,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SEC,
} from "@/modules/auth/otpConstants";
import type { SendCodeResult, VerifyCodeResult } from "@/modules/auth/smsPort";

export type PhoneChallengeGateResult = SendCodeResult | { ok: true };

const nowSec = () => Math.floor(Date.now() / 1000);

/** In-memory: для тестов и режима без БД. */
const memLocks = new Map<string, number>();
const memLastSend = new Map<string, number>();

export async function assertPhoneCanStartChallenge(phone: string): Promise<PhoneChallengeGateResult> {
  const n = phone;
  const pool = env.DATABASE_URL ? getPool() : null;
  if (!pool) {
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

  await pool.query("DELETE FROM phone_otp_locks WHERE locked_until <= $1", [nowSec()]);

  const lockRow = await pool.query<{ locked_until: string | number }>(
    "SELECT locked_until FROM phone_otp_locks WHERE phone_normalized = $1",
    [n]
  );
  if (lockRow.rows.length > 0) {
    const lu = Number(lockRow.rows[0].locked_until);
    if (lu > nowSec()) {
      return {
        ok: false,
        code: "too_many_attempts",
        retryAfterSeconds: Math.max(1, lu - nowSec()),
      };
    }
  }

  const lastCh = await pool.query<{ max_created: Date | null }>(
    "SELECT max(created_at) AS max_created FROM phone_challenges WHERE phone = $1",
    [n]
  );
  const maxCreated = lastCh.rows[0]?.max_created;
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
  if (!env.DATABASE_URL) {
    memLastSend.set(phone, nowSec());
  }
  /* created_at обновляется при INSERT challenge — см. sendCode. */
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
    const pool = env.DATABASE_URL ? getPool() : null;
    if (!pool) {
      memLocks.set(phone, lockUntil);
    } else {
      await pool.query(
        `INSERT INTO phone_otp_locks (phone_normalized, locked_until)
         VALUES ($1, $2)
         ON CONFLICT (phone_normalized) DO UPDATE SET locked_until = EXCLUDED.locked_until`,
        [phone, lockUntil]
      );
    }
    return {
      ok: false,
      code: "too_many_attempts",
      retryAfterSeconds: OTP_LOCK_DURATION_SEC,
    };
  }

  return { ok: false, code: "invalid_code" };
}
