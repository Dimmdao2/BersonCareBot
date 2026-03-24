import { getPool } from "@/infra/db/client";
import type { UserPinRecord, UserPinsPort } from "@/modules/auth/userPinsPort";

export const pgUserPinsPort: UserPinsPort = {
  async getByUserId(userId: string): Promise<UserPinRecord | null> {
    const pool = getPool();
    const res = await pool.query<{
      user_id: string;
      pin_hash: string;
      attempts_failed: number;
      locked_until: Date | null;
    }>(
      `SELECT user_id, pin_hash, attempts_failed, locked_until FROM user_pins WHERE user_id = $1`,
      [userId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      userId: r.user_id,
      pinHash: r.pin_hash,
      attemptsFailed: r.attempts_failed,
      lockedUntil: r.locked_until,
    };
  },

  async upsertPinHash(userId: string, pinHash: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO user_pins (user_id, pin_hash, attempts_failed, locked_until, updated_at)
       VALUES ($1, $2, 0, NULL, now())
       ON CONFLICT (user_id) DO UPDATE SET
         pin_hash = EXCLUDED.pin_hash,
         attempts_failed = 0,
         locked_until = NULL,
         updated_at = now()`,
      [userId, pinHash]
    );
  },

  async incrementFailed(
    userId: string,
    maxAttempts: number,
    lockMinutes: number
  ): Promise<{ attemptsFailed: number; lockedUntil: Date | null }> {
    const pool = getPool();
    const res = await pool.query<{
      attempts_failed: number;
      locked_until: Date | null;
    }>(
      `UPDATE user_pins SET
         attempts_failed = attempts_failed + 1,
         updated_at = now(),
         locked_until = CASE
           WHEN attempts_failed + 1 >= $2 THEN now() + make_interval(mins => $3)
           ELSE locked_until
         END
       WHERE user_id = $1
       RETURNING attempts_failed, locked_until`,
      [userId, maxAttempts, lockMinutes]
    );
    if (res.rows.length === 0) {
      return { attemptsFailed: 0, lockedUntil: null };
    }
    return {
      attemptsFailed: res.rows[0].attempts_failed,
      lockedUntil: res.rows[0].locked_until,
    };
  },

  async resetAttempts(userId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE user_pins SET attempts_failed = 0, locked_until = NULL, updated_at = now() WHERE user_id = $1`,
      [userId]
    );
  },
};
