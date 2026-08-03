/** Wave 3 phase 15C — domain SQL via `runWebappPgText`. */
import { runWebappPgText } from '@/infra/db/runWebappSql';
import type { UserPinRecord, UserPinsPort } from '@/modules/auth/userPinsPort';

function toDateField(v: Date | string): Date {
  return typeof v === 'string' ? new Date(v) : v;
}

function nullableDateField(v: Date | string | null): Date | null {
  if (v == null) return null;
  return toDateField(v);
}

export const pgUserPinsPort: UserPinsPort = {
  async getByUserId(userId: string): Promise<UserPinRecord | null> {
    const res = await runWebappPgText<{
      user_id: string;
      pin_hash: string;
      attempts_failed: number;
      locked_until: Date | string | null;
    }>(
      `SELECT user_id::text AS user_id, pin_hash, attempts_failed, locked_until
       FROM app.auth_user_pin_read($1::uuid)`,
      [userId],
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0]!;
    return {
      userId: r.user_id,
      pinHash: r.pin_hash,
      attemptsFailed: r.attempts_failed,
      lockedUntil: nullableDateField(r.locked_until),
    };
  },

  async getForCurrentPrincipal(_userId: string): Promise<UserPinRecord | null> {
    const res = await runWebappPgText<{
      user_id: string;
      pin_hash: string;
      attempts_failed: number;
      locked_until: Date | string | null;
    }>(
      `SELECT user_id::text AS user_id, pin_hash, attempts_failed, locked_until
       FROM app.auth_user_pin_read_self()`,
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0]!;
    return {
      userId: r.user_id,
      pinHash: r.pin_hash,
      attemptsFailed: r.attempts_failed,
      lockedUntil: nullableDateField(r.locked_until),
    };
  },

  async upsertPinHash(userId: string, pinHash: string): Promise<void> {
    await runWebappPgText(`SELECT app.auth_user_pin_upsert($1::uuid, $2::text) AS updated`, [
      userId,
      pinHash,
    ]);
  },

  async upsertPinHashForCurrentPrincipal(_userId: string, pinHash: string): Promise<void> {
    await runWebappPgText(`SELECT app.auth_user_pin_upsert_self($1::text) AS updated`, [pinHash]);
  },

  async incrementFailed(
    userId: string,
    _maxAttempts: number,
    _lockMinutes: number,
  ): Promise<{ attemptsFailed: number; lockedUntil: Date | null }> {
    const res = await runWebappPgText<{
      attempts_failed: number;
      locked_until: Date | string | null;
    }>(
      `SELECT attempts_failed, locked_until
       FROM app.auth_user_pin_increment_failed($1::uuid)`,
      [userId],
    );
    if (res.rows.length === 0) {
      return { attemptsFailed: 0, lockedUntil: null };
    }
    const row = res.rows[0]!;
    return {
      attemptsFailed: row.attempts_failed,
      lockedUntil: nullableDateField(row.locked_until),
    };
  },

  async resetAttempts(userId: string): Promise<void> {
    await runWebappPgText(`SELECT app.auth_user_pin_reset_attempts($1::uuid) AS reset`, [userId]);
  },
};
