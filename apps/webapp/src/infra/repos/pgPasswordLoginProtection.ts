import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';
import type {
  PasswordLoginProtectionPort,
  PasswordProofAdmission,
  PasswordProofCompletion,
} from '@/modules/auth/passwordLoginProtectionPort';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$mt/HvX3SDg5zeztnCiH/lA$RdL1PQ8kaNQOVryvV2xDljBxTXo7FexX1clNKgZ9boU';

type AcquireRow = {
  status: string;
  lease_token: string | null;
  password_hash: string | null;
  user_id: string | null;
  retry_after_seconds: number;
  captcha_required: boolean;
};

type CompleteRow = {
  accepted: boolean;
  succeeded: boolean;
  user_id: string | null;
  email_verified: boolean;
  attempts: number;
  retry_after_seconds: number;
  captcha_required: boolean;
};

export function createPgPasswordLoginProtectionPort(): PasswordLoginProtectionPort {
  return {
    async acquirePasswordProof(params): Promise<PasswordProofAdmission> {
      const result = await runWebappSql<AcquireRow>(
        getWebappSqlDb(),
        sql`SELECT
           status,
           lease_token::text AS lease_token,
           password_hash,
           user_id::text AS user_id,
           retry_after_seconds,
           captcha_required
         FROM app.password_login_acquire(${params.emailNormalized}, ${params.identifierKey}, ${params.altchaProof?.challengeId ?? null}::uuid, ${params.altchaProof?.challengeDigest ?? null})`,
      );
      const row = result.rows[0];
      if (!row) throw new Error('password_login_acquire_missing_result');
      if (row.status !== 'acquired' || !row.lease_token) {
        const reason =
          row.status === 'locked' ||
          row.status === 'cooldown' ||
          row.status === 'busy' ||
          row.status === 'challenge_required'
            ? row.status
            : 'invalid';
        return {
          acquired: false,
          reason,
          attempts: 0,
          retryAfterSeconds: row.retry_after_seconds,
          captchaRequired: row.captcha_required,
        };
      }
      return {
        acquired: true,
        leaseToken: row.lease_token,
        passwordHash: row.password_hash ?? DUMMY_PASSWORD_HASH,
        userId: row.user_id,
        captchaRequired: row.captcha_required,
      };
    },

    async completePasswordProof(params): Promise<PasswordProofCompletion> {
      const result = await runWebappSql<CompleteRow>(
        getWebappSqlDb(),
        sql`SELECT
           accepted,
           succeeded,
           user_id::text AS user_id,
           email_verified,
           attempts,
           retry_after_seconds,
           captcha_required
         FROM app.password_login_complete(${params.leaseToken}::uuid, ${params.passwordVerified})`,
      );
      const row = result.rows[0];
      if (!row?.accepted) return { accepted: false };
      if (row.succeeded && row.user_id) {
        return {
          accepted: true,
          succeeded: true,
          userId: row.user_id,
          emailVerified: row.email_verified,
        };
      }
      return {
        accepted: true,
        succeeded: false,
        attempts: row.attempts,
        retryAfterSeconds: row.retry_after_seconds,
        captchaRequired: row.captcha_required,
      };
    },

    async readAltchaRootSecret() {
      const result = await runWebappSql<{ secret: string | null }>(
        getWebappSqlDb(),
        sql`SELECT app.password_login_read_altcha_secret() AS secret`,
      );
      return result.rows[0]?.secret ?? null;
    },

    async registerAltchaChallenge(params) {
      const result = await runWebappSql<{ issued: boolean }>(
        getWebappSqlDb(),
        sql`SELECT app.password_login_issue_altcha_challenge(
           ${params.emailNormalized},
           ${params.challengeId}::uuid,
           ${params.challengeDigest},
           ${params.expiresAt.toISOString()}::timestamptz
         ) AS issued`,
      );
      return result.rows[0]?.issued === true;
    },
  };
}

export const inMemoryPasswordLoginProtectionPort: PasswordLoginProtectionPort = {
  async acquirePasswordProof() {
    return {
      acquired: false,
      reason: 'invalid',
      attempts: 0,
      retryAfterSeconds: 0,
      captchaRequired: false,
    };
  },
  async completePasswordProof() {
    return { accepted: false };
  },
  async readAltchaRootSecret() {
    return null;
  },
  async registerAltchaChallenge() {
    return false;
  },
};
