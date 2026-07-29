/** Wave 3 phase 15B — domain SQL via `runWebappPgText`; TX on `registerPendingVerification`. */
import { runWebappPgText, runWebappTransaction } from '@/infra/db/runWebappSql';
import argon2 from 'argon2';
import {
  passwordIdentifierKey,
  type PasswordAltchaProof,
  type PasswordVerificationResult,
} from '@/modules/auth/passwordLoginProtection';
import type { PasswordLoginProtectionPort } from '@/modules/auth/passwordLoginProtectionPort';

export type UserPasswordCredentialsPort = {
  /** Регистрация клиента с паролем до подтверждения email (`email_verified_at` заполняется challenge). */
  registerPendingVerification(params: {
    emailNormalized: string;
    passwordHash: string;
    lastName: string;
    firstName: string;
    patronymic: string | null;
  }): Promise<{ ok: true; userId: string } | { ok: false; reason: 'duplicate_email' }>;
  /** Регистрация специалиста с паролем до подтверждения email; role остаётся doctor для compat projection. */
  registerPendingSpecialistVerification(params: {
    emailNormalized: string;
    passwordHash: string;
    lastName: string;
    firstName: string;
    patronymic: string | null;
  }): Promise<{ ok: true; userId: string } | { ok: false; reason: 'duplicate_email' }>;
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
  tryVerifyLogin(
    emailNormalized: string,
    plainPassword: string,
    altchaProof?: PasswordAltchaProof,
    altchaSubmitted?: boolean,
  ): Promise<PasswordVerificationResult>;
  /**
   * Проверка пароля без требования `email_verified_at` — для UX «дозавершите подтверждение email»
   * и нейтрального отличия от «неверный пароль».
   */
  verifyEmailPasswordForLogin(
    emailNormalized: string,
    plainPassword: string,
    altchaProof?: PasswordAltchaProof,
    altchaSubmitted?: boolean,
  ): Promise<PasswordVerificationResult>;
  /** Пользователь с подтверждённым email и строкой пароля (для сброса). */
  findVerifiedUserIdWithPassword(emailNormalized: string): Promise<string | null>;
  updatePasswordHash(userId: string, emailNormalized: string, passwordHash: string): Promise<void>;
  /** Создать или обновить пароль (email setup, verified user без credentials). */
  upsertPasswordHash(userId: string, emailNormalized: string, passwordHash: string): Promise<void>;
};

export function createPgUserPasswordCredentialsPort(
  protection: PasswordLoginProtectionPort,
): UserPasswordCredentialsPort {
  async function registerPendingVerificationWithRole(params: {
    emailNormalized: string;
    passwordHash: string;
    lastName: string;
    firstName: string;
    patronymic: string | null;
    role: 'client' | 'doctor';
  }): Promise<{ ok: true; userId: string } | { ok: false; reason: 'duplicate_email' }> {
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
          throw new Error('email_password_register_pending_failed');
        }
        if (!row.ok) {
          return { ok: false, reason: 'duplicate_email' };
        }
        if (!row.user_id) {
          throw new Error('email_password_register_pending_missing_user_id');
        }
        return { ok: true as const, userId: row.user_id };
      });
    } catch (e: unknown) {
      const code =
        typeof e === 'object' && e !== null && 'code' in e
          ? String((e as { code?: unknown }).code)
          : '';
      if (code === '23505') {
        return { ok: false, reason: 'duplicate_email' };
      }
      throw e;
    }
  }

  async function verifyEmailPasswordForLoginImpl(
    emailNormalized: string,
    plainPassword: string,
    altchaProof?: PasswordAltchaProof,
    altchaSubmitted = false,
  ): Promise<PasswordVerificationResult> {
    const admission = await protection.acquirePasswordProof({
      emailNormalized,
      identifierKey: passwordIdentifierKey(emailNormalized),
      ...(altchaProof ? { altchaProof } : {}),
    });
    if (!admission.acquired) {
      return {
        ok: false,
        attempts: admission.attempts,
        retryAfterSeconds: admission.retryAfterSeconds,
        captchaRequired: admission.captchaRequired,
        captchaRefreshRequired:
          altchaSubmitted && admission.reason === 'challenge_required',
        locked: admission.reason === 'locked',
      };
    }

    let verified = false;
    try {
      verified = await argon2.verify(admission.passwordHash, plainPassword);
    } catch {
      verified = false;
    }
    const completion = await protection.completePasswordProof({
      leaseToken: admission.leaseToken,
      passwordVerified: verified && admission.userId !== null,
    });
    if (!completion.accepted) {
      return {
        ok: false,
        attempts: 0,
        retryAfterSeconds: 1,
        captchaRequired: admission.captchaRequired,
        captchaRefreshRequired: altchaProof !== undefined,
        locked: false,
      };
    }
    if (completion.succeeded) {
      return {
        ok: true,
        userId: completion.userId,
        emailVerified: completion.emailVerified,
      };
    }
    return {
      ok: false,
      attempts: completion.attempts,
      retryAfterSeconds: completion.retryAfterSeconds,
      captchaRequired: completion.captchaRequired,
      captchaRefreshRequired: altchaProof !== undefined,
      locked: completion.attempts >= 10,
    };
  }

  return {
    async registerPendingVerification(params) {
      return registerPendingVerificationWithRole({ ...params, role: 'client' });
    },

    async registerPendingSpecialistVerification(params) {
      return registerPendingVerificationWithRole({ ...params, role: 'doctor' });
    },

    async deleteUnverifiedEmailPasswordRegistration(userId) {
      await runWebappPgText('SELECT app.email_password_delete_unverified_registration($1::uuid)', [
        userId,
      ]);
    },

    async findUserIdByEmailChallengeId(challengeId) {
      const r = await runWebappPgText<{ user_id: string }>(
        'SELECT app.email_password_find_user_id_by_email_challenge($1::uuid)::text AS user_id',
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

    async tryVerifyLogin(emailNormalized, plainPassword, altchaProof, altchaSubmitted) {
      const r = await verifyEmailPasswordForLoginImpl(
        emailNormalized,
        plainPassword,
        altchaProof,
        altchaSubmitted,
      );
      if (!r.ok || !r.emailVerified) return r;
      return r;
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

    async updatePasswordHash(_userId, emailNormalized, passwordHash) {
      const res = await runWebappPgText<{ updated: boolean }>(
        'SELECT app.password_credentials_replace_self($1::text, $2::text) AS updated',
        [emailNormalized, passwordHash],
      );
      if (res.rows[0]?.updated !== true) {
        throw new Error('updatePasswordHash: no credentials row');
      }
    },

    async upsertPasswordHash(_userId, emailNormalized, passwordHash) {
      const res = await runWebappPgText<{ updated: boolean }>(
        'SELECT app.password_credentials_upsert_self($1::text, $2::text) AS updated',
        [emailNormalized, passwordHash],
      );
      if (res.rows[0]?.updated !== true) {
        throw new Error('upsertPasswordHash: self email mismatch');
      }
    },
  };
}

export const inMemoryUserPasswordCredentialsPort: UserPasswordCredentialsPort = {
  async registerPendingVerification() {
    return { ok: false, reason: 'duplicate_email' };
  },
  async registerPendingSpecialistVerification() {
    return { ok: false, reason: 'duplicate_email' };
  },
  async deleteUnverifiedEmailPasswordRegistration() {},
  async findUserIdByEmailChallengeId() {
    return null;
  },
  async tryResendRegistrationChallenge() {
    return { ok: false };
  },
  async tryVerifyLogin() {
    return {
      ok: false,
      attempts: 1,
      retryAfterSeconds: 0,
      captchaRequired: false,
      captchaRefreshRequired: false,
      locked: false,
    };
  },
  async verifyEmailPasswordForLogin() {
    return {
      ok: false,
      attempts: 1,
      retryAfterSeconds: 0,
      captchaRequired: false,
      captchaRefreshRequired: false,
      locked: false,
    };
  },
  async findVerifiedUserIdWithPassword() {
    return null;
  },
  async updatePasswordHash() {},
  async upsertPasswordHash() {},
};
