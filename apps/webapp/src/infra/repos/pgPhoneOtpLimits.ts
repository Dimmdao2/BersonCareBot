import { runWebappPgText } from "@/infra/db/runWebappSql";

export async function deleteExpiredPhoneOtpLocks(nowSec: number): Promise<void> {
  await runWebappPgText("DELETE FROM phone_otp_locks WHERE locked_until <= $1", [nowSec]);
}

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

export async function upsertPhoneOtpLock(phoneNormalized: string, lockedUntil: number): Promise<void> {
  await runWebappPgText(
    `INSERT INTO phone_otp_locks (phone_normalized, locked_until)
     VALUES ($1, $2)
     ON CONFLICT (phone_normalized) DO UPDATE SET locked_until = EXCLUDED.locked_until`,
    [phoneNormalized, lockedUntil],
  );
}

export const pgPhoneOtpLimitsPort = {
  deleteExpiredLocks: deleteExpiredPhoneOtpLocks,
  findLock: findPhoneOtpLock,
  findLatestChallengeCreatedAt: findLatestPhoneChallengeCreatedAt,
  upsertLock: upsertPhoneOtpLock,
};
