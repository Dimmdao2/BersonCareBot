/**
 * DB implementation for the public email-OTP login flow port.
 * Satisfies EmailOtpPublicDbPort from modules/auth/emailOtpPublicPort.ts.
 */
import { runWebappPgText, runWebappTransaction } from "@/infra/db/runWebappSql";
import type { EmailOtpPublicDbPort } from "@/modules/auth/emailOtpPublicPort";

export function createPgEmailOtpPublicPort(): EmailOtpPublicDbPort {
  return {
    async findOrCreatePublicEmailUser(emailNorm) {
      // Use transaction + SELECT FOR UPDATE to prevent race-condition duplicate inserts.
      return runWebappTransaction(async (tx) => {
        // Try to find existing active user with this email.
        const existing = await runWebappPgText<{ id: string }>(
          `SELECT id FROM platform_users
           WHERE email_normalized = $1 AND merged_into_id IS NULL
           LIMIT 1`,
          [emailNorm],
          tx,
        );
        if (existing.rows[0]) {
          return { userId: existing.rows[0].id, wasCreated: false };
        }

        // None found — insert a new 'client' row with unverified email.
        // email_normalized uniqueness is enforced by partial index uq_platform_users_email_normalized_active.
        // Display name defaults to the part before @.
        const displayName = emailNorm.split("@")[0] ?? emailNorm;
        const ins = await runWebappPgText<{ id: string }>(
          `INSERT INTO platform_users (email, email_normalized, display_name, role)
           VALUES ($1, $1, $2, 'client')
           ON CONFLICT (email_normalized) WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL DO NOTHING
           RETURNING id`,
          [emailNorm, displayName],
          tx,
        );
        if (ins.rows[0]) {
          return { userId: ins.rows[0].id, wasCreated: true };
        }

        // ON CONFLICT: another concurrent request inserted — fetch the row.
        const retry = await runWebappPgText<{ id: string }>(
          `SELECT id FROM platform_users
           WHERE email_normalized = $1 AND merged_into_id IS NULL
           LIMIT 1`,
          [emailNorm],
          tx,
        );
        const userId = retry.rows[0]?.id;
        if (!userId) {
          throw new Error("pgEmailOtpPublic: could not find or create user for email " + emailNorm);
        }
        return { userId, wasCreated: false };
      });
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
        `SELECT id, user_id::text AS user_id, code_hash, expires_at::text, attempts::text
         FROM email_challenges
         WHERE email = $1 AND expires_at > $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [emailNorm, nowSec],
      );
      return r.rows[0] ?? null;
    },

    async findEmailSendCooldownByEmail(emailNorm) {
      // Pick the most recent cooldown for this email regardless of which user_id owns it.
      const r = await runWebappPgText<{ last_sent_at: Date | string }>(
        `SELECT last_sent_at FROM email_send_cooldowns
         WHERE email_normalized = $1
         ORDER BY last_sent_at DESC
         LIMIT 1`,
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
