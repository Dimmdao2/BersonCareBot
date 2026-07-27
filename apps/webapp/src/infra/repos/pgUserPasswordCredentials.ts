/** Wave 3 phase 15B — domain SQL via `runWebappPgText`; TX on `registerPendingVerification`. */
import { runWebappPgText, runWebappTransaction } from "@/infra/db/runWebappSql";
import argon2 from "argon2";

export type UserPasswordCredentialsPort = {
  /** Регистрация клиента с паролем до подтверждения email (`email_verified_at` заполняется challenge). */
  registerPendingVerification(params: {
    emailNormalized: string;
    passwordHash: string;
    lastName: string;
    firstName: string;
    patronymic: string | null;
  }): Promise<{ ok: true; userId: string } | { ok: false; reason: "duplicate_email" }>;
  /** Регистрация специалиста с паролем до подтверждения email; role остаётся doctor для compat projection. */
  registerPendingSpecialistVerification(params: {
    emailNormalized: string;
    passwordHash: string;
    lastName: string;
    firstName: string;
    patronymic: string | null;
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
  /** Создать или обновить пароль (email setup, verified user без credentials). */
  upsertPasswordHash(userId: string, passwordHash: string): Promise<void>;
};

export function createPgUserPasswordCredentialsPort(): UserPasswordCredentialsPort {
  async function registerPendingVerificationWithRole(params: {
    emailNormalized: string;
    passwordHash: string;
    lastName: string;
    firstName: string;
    patronymic: string | null;
    role: "client" | "doctor";
  }): Promise<{ ok: true; userId: string } | { ok: false; reason: "duplicate_email" }> {
    try {
      return await runWebappTransaction(async (tx) => {
        const result = await runWebappPgText<{
          ok: boolean;
          code: string | null;
          user_id: string | null;
        }>(
          `SELECT ok, code, user_id::text AS user_id
           FROM app.email_password_register_pending($1, $2, $3, $4, $5, $6)`,
          [
            params.emailNormalized,
            params.passwordHash,
            params.lastName,
            params.firstName,
            params.patronymic,
            params.role,
          ],
          tx,
        );
        const row = result.rows[0];
        if (!row) {
          throw new Error("email_password_register_pending_failed");
        }
        if (!row.ok) {
          return { ok: false, reason: "duplicate_email" };
        }
        if (!row.user_id) {
          throw new Error("email_password_register_pending_missing_user_id");
        }
        return { ok: true as const, userId: row.user_id };
      });
    } catch (e: unknown) {
      const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: unknown }).code) : "";
      if (code === "23505") {
        return { ok: false, reason: "duplicate_email" };
      }
      throw e;
    }
  }

  async function verifyEmailPasswordForLoginImpl(
    emailNormalized: string,
    plainPassword: string,
  ): Promise<{ userId: string; emailVerified: boolean } | null> {
    const r = await runWebappPgText<{ user_id: string; password_hash: string; email_verified: boolean }>(
      `SELECT user_id::text AS user_id, password_hash, email_verified
       FROM app.email_password_find_login_candidate($1)`,
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
      return registerPendingVerificationWithRole({ ...params, role: "client" });
    },

    async registerPendingSpecialistVerification(params) {
      return registerPendingVerificationWithRole({ ...params, role: "doctor" });
    },

    async deleteUnverifiedEmailPasswordRegistration(userId) {
      await runWebappPgText(
        "SELECT app.email_password_delete_unverified_registration($1::uuid)",
        [userId],
      );
    },

    async findUserIdByEmailChallengeId(challengeId) {
      const r = await runWebappPgText<{ user_id: string }>(
        "SELECT app.email_password_find_user_id_by_email_challenge($1::uuid)::text AS user_id",
        [challengeId],
      );
      return r.rows[0]?.user_id ?? null;
    },

    async tryResendRegistrationChallenge({ emailNormalized, plainPassword }) {
      const r = await runWebappPgText<{ id: string; password_hash: string }>(
        `SELECT user_id::text AS id, password_hash
         FROM app.email_password_find_login_candidate($1)
         WHERE email_verified = false`,
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
      const r = await runWebappPgText<{ id: string }>(
        `SELECT user_id::text AS id
         FROM app.email_password_find_login_candidate($1)
         WHERE email_verified = true`,
        [emailNormalized],
      );
      return r.rows[0]?.id ?? null;
    },

    async updatePasswordHash(_userId, passwordHash) {
      const res = await runWebappPgText<{ updated: boolean }>(
        "SELECT app.set_staff_security_self_password_hash($1::text) AS updated",
        [passwordHash],
      );
      if (res.rows[0]?.updated !== true) {
        throw new Error("updatePasswordHash: no credentials row");
      }
    },

    async upsertPasswordHash(userId, passwordHash) {
      await runWebappPgText(
        `INSERT INTO user_password_credentials (user_id, password_hash, updated_at)
         VALUES ($1::uuid, $2::text, now())
         ON CONFLICT (user_id) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
        [userId, passwordHash],
      );
    },
  };
}

export const inMemoryUserPasswordCredentialsPort: UserPasswordCredentialsPort = {
  async registerPendingVerification() {
    return { ok: false, reason: "duplicate_email" };
  },
  async registerPendingSpecialistVerification() {
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
  async upsertPasswordHash() {},
};
