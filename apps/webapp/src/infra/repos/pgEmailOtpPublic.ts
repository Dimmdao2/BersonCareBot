/**
 * DB implementation for the public email-OTP login flow port.
 * Satisfies EmailOtpPublicDbPort from modules/auth/emailOtpPublicPort.ts.
 */
import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { EmailOtpPublicDbPort } from "@/modules/auth/emailOtpPublicPort";

export function createPgEmailOtpPublicPort(): EmailOtpPublicDbPort {
  return {
    async findOrCreatePublicEmailUser(emailNorm) {
      const result = await runWebappPgText<{ user_id: string; was_created: boolean }>(
        `SELECT user_id::text, was_created
         FROM app.email_otp_public_find_or_create_user($1)`,
        [emailNorm],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("pgEmailOtpPublic: could not find or create user for email " + emailNorm);
      }
      return { userId: row.user_id, wasCreated: row.was_created };
    },

    async findLatestEmailChallengeByEmail(emailNorm, nowSec) {
      // email_challenges.email stores the normalized email (startEmailChallenge receives normalizeEmail output).
      const r = await runWebappPgText<{
        id: string;
        user_id: string;
        code_hash: string;
        expires_at: string;
        attempts: string;
      }>(
        `SELECT id::text, user_id::text AS user_id, code_hash, expires_at::text, attempts::text
         FROM app.email_otp_public_find_latest_email_challenge_by_email($1, $2::bigint)`,
        [emailNorm, nowSec],
      );
      return r.rows[0] ?? null;
    },

    async findEmailSendCooldownByEmail(emailNorm) {
      // Pick the most recent cooldown for this email regardless of which user_id owns it.
      const r = await runWebappPgText<{ last_sent_at: Date | string }>(
        `SELECT last_sent_at
         FROM app.email_otp_public_find_email_send_cooldown_by_email($1)`,
        [emailNorm],
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
    let userId = memEmailUserByNorm.get(emailNorm);
    if (userId) return { userId, wasCreated: false };
    userId = crypto.randomUUID();
    memEmailUserByNorm.set(emailNorm, userId);
    return { userId, wasCreated: true };
  },

  async findLatestEmailChallengeByEmail(_emailNorm, _nowSec) {
    // In-memory path: not used by route tests (they mock buildAppDeps).
    return null;
  },

  async findEmailSendCooldownByEmail(emailNorm) {
    const ts = memEmailCooldown.get(emailNorm);
    if (!ts) return null;
    return new Date(ts);
  },
};
