import { getPool } from "@/infra/db/client";
import argon2 from "argon2";

export type UserPasswordCredentialsPort = {
  /** Регистрация клиента с паролем до подтверждения email (`email_verified_at` заполняется challenge). */
  registerPendingVerification(params: {
    emailNormalized: string;
    passwordHash: string;
    displayName: string;
  }): Promise<{ ok: true; userId: string } | { ok: false; reason: "duplicate_email" }>;
  /** Удалить канон без подтверждения email (откат после сбоя отправки кода и т.п.). */
  deleteUnverifiedEmailPasswordRegistration(userId: string): Promise<void>;
  /** Владелец активного челленджа на email (для публичного подтверждения после регистрации). */
  findUserIdByEmailChallengeId(challengeId: string): Promise<string | null>;
  /**
   * Неподтверждённая регистрация с тем же email: проверка пароля и повторная отправка кода
   * (тот же контракт ответа, что у успешного `registerPendingVerification` + `startEmailChallenge`).
   */
  tryResendRegistrationChallenge(params: {
    emailNormalized: string;
    plainPassword: string;
  }): Promise<{ ok: true; userId: string } | { ok: false }>;
  tryVerifyLogin(emailNormalized: string, plainPassword: string): Promise<{ userId: string } | null>;
  /**
   * Проверка пароля без требования `email_verified_at` — для UX «дозавершите подтверждение email»
   * и нейтрального отличия от «неверный пароль».
   */
  verifyEmailPasswordForLogin(
    emailNormalized: string,
    plainPassword: string,
  ): Promise<{ userId: string; emailVerified: boolean } | null>;
  /** Пользователь с подтверждённым email и строкой пароля (для сброса). */
  findVerifiedUserIdWithPassword(emailNormalized: string): Promise<string | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
};

export function createPgUserPasswordCredentialsPort(): UserPasswordCredentialsPort {
  async function verifyEmailPasswordForLoginImpl(
    emailNormalized: string,
    plainPassword: string,
  ): Promise<{ userId: string; emailVerified: boolean } | null> {
    const pool = getPool();
    const r = await pool.query<{ user_id: string; password_hash: string; email_verified: boolean }>(
      `SELECT upc.user_id::text AS user_id, upc.password_hash,
              (pu.email_verified_at IS NOT NULL) AS email_verified
       FROM user_password_credentials upc
       INNER JOIN platform_users pu ON pu.id = upc.user_id
       WHERE pu.merged_into_id IS NULL
         AND pu.email_normalized = $1
       LIMIT 1`,
      [emailNormalized],
    );
    const row = r.rows[0];
    if (!row) return null;
    try {
      const ok = await argon2.verify(row.password_hash, plainPassword);
      if (!ok) return null;
      return { userId: row.user_id, emailVerified: row.email_verified };
    } catch {
      return null;
    }
  }

  return {
    async registerPendingVerification(params) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query<{ id: string }>(
          `INSERT INTO platform_users (display_name, email, email_normalized, role)
           VALUES ($1, $2, $3, 'client')
           RETURNING id`,
          [params.displayName, params.emailNormalized, params.emailNormalized],
        );
        const userId = ins.rows[0]!.id;
        await client.query(
          `INSERT INTO user_password_credentials (user_id, password_hash, updated_at)
           VALUES ($1::uuid, $2::text, now())`,
          [userId, params.passwordHash],
        );
        await client.query("COMMIT");
        return { ok: true, userId };
      } catch (e: unknown) {
        await client.query("ROLLBACK");
        const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: unknown }).code) : "";
        if (code === "23505") {
          return { ok: false, reason: "duplicate_email" };
        }
        throw e;
      } finally {
        client.release();
      }
    },

    async deleteUnverifiedEmailPasswordRegistration(userId) {
      const pool = getPool();
      await pool.query(
        `DELETE FROM platform_users
         WHERE id = $1::uuid
           AND role = 'client'
           AND merged_into_id IS NULL
           AND email_verified_at IS NULL`,
        [userId],
      );
    },

    async findUserIdByEmailChallengeId(challengeId) {
      const pool = getPool();
      const r = await pool.query<{ user_id: string }>(
        "SELECT user_id::text AS user_id FROM email_challenges WHERE id = $1::uuid LIMIT 1",
        [challengeId],
      );
      return r.rows[0]?.user_id ?? null;
    },

    async tryResendRegistrationChallenge({ emailNormalized, plainPassword }) {
      const pool = getPool();
      const r = await pool.query<{ id: string; password_hash: string }>(
        `SELECT pu.id::text AS id, upc.password_hash
         FROM platform_users pu
         INNER JOIN user_password_credentials upc ON upc.user_id = pu.id
         WHERE pu.email_normalized = $1
           AND pu.merged_into_id IS NULL
           AND pu.email_verified_at IS NULL`,
        [emailNormalized],
      );
      const row = r.rows[0];
      if (!row) return { ok: false };
      try {
        const ok = await argon2.verify(row.password_hash, plainPassword);
        if (!ok) return { ok: false };
        return { ok: true, userId: row.id };
      } catch {
        return { ok: false };
      }
    },

    async tryVerifyLogin(emailNormalized, plainPassword) {
      const r = await verifyEmailPasswordForLoginImpl(emailNormalized, plainPassword);
      if (!r?.emailVerified) return null;
      return { userId: r.userId };
    },

    verifyEmailPasswordForLogin: verifyEmailPasswordForLoginImpl,

    async findVerifiedUserIdWithPassword(emailNormalized) {
      const pool = getPool();
      const r = await pool.query<{ id: string }>(
        `SELECT upc.user_id::text AS id
         FROM user_password_credentials upc
         INNER JOIN platform_users pu ON pu.id = upc.user_id
         WHERE pu.merged_into_id IS NULL
           AND pu.email_normalized = $1
           AND pu.email_verified_at IS NOT NULL
         LIMIT 1`,
        [emailNormalized],
      );
      return r.rows[0]?.id ?? null;
    },

    async updatePasswordHash(userId, passwordHash) {
      const pool = getPool();
      const res = await pool.query(`UPDATE user_password_credentials SET password_hash = $2, updated_at = now() WHERE user_id = $1::uuid`, [
        userId,
        passwordHash,
      ]);
      if ((res.rowCount ?? 0) === 0) {
        throw new Error("updatePasswordHash: no credentials row");
      }
    },
  };
}

export const inMemoryUserPasswordCredentialsPort: UserPasswordCredentialsPort = {
  async registerPendingVerification() {
    return { ok: false, reason: "duplicate_email" };
  },
  async deleteUnverifiedEmailPasswordRegistration() {},
  async findUserIdByEmailChallengeId() {
    return null;
  },
  async tryResendRegistrationChallenge() {
    return { ok: false };
  },
  async tryVerifyLogin() {
    return null;
  },
  async verifyEmailPasswordForLogin() {
    return null;
  },
  async findVerifiedUserIdWithPassword() {
    return null;
  },
  async updatePasswordHash() {},
};
