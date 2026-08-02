/**
 * DB implementation for the public email-OTP login flow port.
 * Satisfies EmailOtpPublicDbPort from modules/auth/emailOtpPublicPort.ts.
 */
import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';
import type { EmailOtpPublicDbPort } from '@/modules/auth/emailOtpPublicPort';

export function createPgEmailOtpPublicPort(): EmailOtpPublicDbPort {
  return {
    async findOrCreatePublicEmailUser(emailNorm) {
      const result = await runWebappSql<{ user_id: string; was_created: boolean }>(
        getWebappSqlDb(),
        sql`SELECT user_id::text, was_created
            FROM app.email_otp_public_find_or_create_user(${emailNorm})`,
      );
      const row = result.rows[0];
      if (!row) throw new Error('email_otp_public_find_or_create_user_failed');
      return { userId: row.user_id, wasCreated: row.was_created };
    },

    async findPublicEmailUser(emailNorm) {
      const result = await runWebappSql<{ user_id: string }>(
        getWebappSqlDb(),
        sql`SELECT user_id::text
            FROM app.email_otp_public_find_user_by_email(${emailNorm})`,
      );
      const row = result.rows[0];
      return row ? { userId: row.user_id } : null;
    },

    async registerPublicEmailPatient(input) {
      const result = await runWebappSql<{
        ok: boolean;
        user_id: string | null;
        was_created: boolean;
      }>(
        getWebappSqlDb(),
        sql`SELECT ok, user_id::text AS user_id, was_created
            FROM app.email_otp_public_register_patient(${input.emailNormalized}, ${input.lastName}, ${input.firstName}, ${input.patronymic})`,
      );
      const row = result.rows[0];
      if (!row) throw new Error('email_otp_public_register_patient_failed');
      if (!row.ok || !row.user_id) return { ok: false, reason: 'duplicate_email' };
      return { ok: true, userId: row.user_id, wasCreated: row.was_created };
    },

    async consumeLatestEmailChallenge(emailNorm, codeHash) {
      const result = await runWebappSql<{
        ok: boolean;
        code: 'invalid_code' | 'expired_code' | 'too_many_attempts' | 'email_conflict' | null;
        user_id: string | null;
        retry_after_seconds: number | null;
      }>(
        getWebappSqlDb(),
        sql`SELECT ok, code, user_id::text AS user_id, retry_after_seconds
            FROM app.email_otp_public_consume_latest_challenge(${emailNorm}, ${codeHash})`,
      );
      const row = result.rows[0];
      if (!row) throw new Error('email_otp_public_consume_latest_challenge_failed');
      if (row.ok && row.user_id) return { ok: true as const, userId: row.user_id };
      if (!row.code) throw new Error('email_otp_public_consume_latest_challenge_invalid_result');
      return {
        ok: false as const,
        code: row.code,
        ...(row.retry_after_seconds == null ? {} : { retryAfterSeconds: row.retry_after_seconds }),
      };
    },

    async findEmailSendCooldownByEmail(emailNorm) {
      // Pick the most recent cooldown for this email regardless of which user_id owns it.
      const r = await runWebappSql<{ last_sent_at: Date | string }>(
        getWebappSqlDb(),
        sql`SELECT last_sent_at
            FROM app.email_otp_public_find_email_send_cooldown_by_email(${emailNorm})`,
      );
      const raw = r.rows[0]?.last_sent_at;
      if (!raw) return null;
      if (raw instanceof Date) return raw;
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    },
  };
}

/** In-memory implementation for tests (no DATABASE_URL). */
const memEmailUserByNorm = new Map<string, string>(); // emailNorm → userId
const memEmailCooldown = new Map<string, number>(); // emailNorm → timestamp ms

export function resetEmailOtpPublicMemStateForTests(): void {
  memEmailUserByNorm.clear();
  memEmailCooldown.clear();
}

export const inMemoryEmailOtpPublicPort: EmailOtpPublicDbPort = {
  async findOrCreatePublicEmailUser(emailNorm) {
    const existing = memEmailUserByNorm.get(emailNorm);
    if (existing) return { userId: existing, wasCreated: false };
    const userId = crypto.randomUUID();
    memEmailUserByNorm.set(emailNorm, userId);
    return { userId, wasCreated: true };
  },

  async findPublicEmailUser(emailNorm) {
    const userId = memEmailUserByNorm.get(emailNorm);
    return userId ? { userId } : null;
  },

  async registerPublicEmailPatient({ emailNormalized }) {
    const existing = memEmailUserByNorm.get(emailNormalized);
    if (existing) return { ok: true, userId: existing, wasCreated: false };
    const userId = crypto.randomUUID();
    memEmailUserByNorm.set(emailNormalized, userId);
    return { ok: true, userId, wasCreated: true };
  },

  async consumeLatestEmailChallenge(_emailNorm, _codeHash) {
    return { ok: false as const, code: 'expired_code' as const };
  },

  async findEmailSendCooldownByEmail(emailNorm) {
    const ts = memEmailCooldown.get(emailNorm);
    if (!ts) return null;
    return new Date(ts);
  },
};
