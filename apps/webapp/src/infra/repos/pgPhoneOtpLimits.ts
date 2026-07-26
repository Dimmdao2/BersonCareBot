import { runWebappPgText } from "@/infra/db/runWebappSql";

export async function findPhoneOtpLock(
  phoneNormalized: string,
): Promise<{ locked_until: string | number } | null> {
  const lockRow = await runWebappPgText<{ locked_until: string | number }>(
    "SELECT locked_until FROM phone_otp_locks WHERE phone_normalized = $1",
    [phoneNormalized],
  );
  return lockRow.rows[0] ?? null;
}

export async function findLatestPhoneChallengeCreatedAt(
  phoneNormalized: string,
): Promise<Date | null> {
  const lastCh = await runWebappPgText<{ max_created: Date | string | null }>(
    "SELECT max(created_at) AS max_created FROM phone_challenges WHERE phone = $1",
    [phoneNormalized],
  );
  const raw = lastCh.rows[0]?.max_created;
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Decaying OTP lockout (night plan C-2 step 3), same formula/citations as
 * app.email_auth_register_email_otp_lockout (0248_otp_decaying_lockout.sql) and
 * otpConstants.ts:nextOtpLockoutDurationSeconds: 120 * 2^cycle seconds, cycle taken from the row's
 * value BEFORE this statement (Postgres reads the pre-update row for every expression in a SET
 * clause), capped at 1800s. `ON CONFLICT ... DO UPDATE` is Postgres's own serialization point for
 * two concurrent escalations against the same phone -- no separate SELECT-then-write round trip
 * exists for a second writer to race against.
 *
 * `phone_otp_locks` is also written by the unrelated anonymous A-3 booking OTP engine
 * (`app.phone_otp_public_booking_consume_challenge`, 0245), which never references `lockout_cycle`.
 * A booking-triggered lock can therefore leave a stale cycle value here; harmless, because this
 * formula re-caps at 1800s regardless of the exponent it reads.
 */
export async function registerPhoneOtpLockout(phoneNormalized: string, nowSec: number): Promise<number> {
  const r = await runWebappPgText<{ locked_until: string | number }>(
    `INSERT INTO phone_otp_locks (phone_normalized, lockout_cycle, locked_until)
     VALUES ($1, 1, $2 + 120)
     ON CONFLICT (phone_normalized) DO UPDATE SET
       lockout_cycle = phone_otp_locks.lockout_cycle + 1,
       locked_until = $2 + LEAST(1800, (120 * power(2, LEAST(phone_otp_locks.lockout_cycle, 10)))::bigint)
     RETURNING locked_until`,
    [phoneNormalized, nowSec],
  );
  return Number(r.rows[0]!.locked_until);
}

/** NIST SP 800-63B §5.2.2: disregard previous failed attempts after a successful verification. */
export async function resetPhoneOtpLockout(phoneNormalized: string): Promise<void> {
  await runWebappPgText("DELETE FROM phone_otp_locks WHERE phone_normalized = $1", [phoneNormalized]);
}

export const pgPhoneOtpLimitsPort = {
  findLock: findPhoneOtpLock,
  findLatestChallengeCreatedAt: findLatestPhoneChallengeCreatedAt,
  registerLockout: registerPhoneOtpLockout,
  resetLockout: resetPhoneOtpLockout,
};
