import { randomBytes } from "node:crypto";
import type { StaffSecurityPort, StaffSecurityStatus } from "./ports";
import {
  buildTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashStaffSecuritySecret,
  verifyTotpCode,
} from "./totp";

const LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function statusOf(profile: Awaited<ReturnType<StaffSecurityPort["ensureProfile"]>>): StaffSecurityStatus {
  return {
    enrolled: profile.factorType === "totp" && profile.factorVerifiedAt !== null,
    recoveryConfirmed: profile.recoveryCodesConfirmedAt !== null,
    replacementRequired: profile.replacementRequired,
    lockedUntil: profile.lockedUntil,
    sessionVersion: profile.sessionVersion,
  };
}

export function createStaffSecurityService(port: StaffSecurityPort) {
  return {
    async ensureProfile(userId: string): Promise<StaffSecurityStatus> {
      return statusOf(await port.ensureProfile(userId));
    },

    async getStatus(userId: string): Promise<StaffSecurityStatus | null> {
      const profile = await port.getProfile(userId);
      return profile ? statusOf(profile) : null;
    },

    async startTotpEnrollment(input: { userId: string; email: string }) {
      const profile = await port.ensureProfile(input.userId);
      if (profile.factorVerifiedAt && profile.recoveryCodesConfirmedAt && !profile.replacementRequired) {
        return { ok: false as const, error: "factor_already_enrolled" as const };
      }
      const secret = generateTotpSecret();
      await port.savePendingTotp(input.userId, encryptTotpSecret(secret));
      return { ok: true as const, secret, uri: buildTotpUri({ secret, email: input.email }) };
    },

    async verifyTotpEnrollment(input: { userId: string; code: string }) {
      const profile = await port.getProfile(input.userId);
      if (!profile?.pendingTotpSecretCiphertext) {
        return { ok: false as const, error: "enrollment_not_started" as const };
      }
      if (profile.lockedUntil && Date.parse(profile.lockedUntil) > Date.now()) {
        return { ok: false as const, error: "factor_locked" as const, lockedUntil: profile.lockedUntil };
      }
      if (!verifyTotpCode(decryptTotpSecret(profile.pendingTotpSecretCiphertext), input.code)) {
        const lockedUntil = await port.recordFailedFactorAttempt(input.userId);
        return { ok: false as const, error: lockedUntil ? "factor_locked" as const : "invalid_factor" as const, lockedUntil };
      }
      const recoveryCodes = generateRecoveryCodes();
      const sessionVersion = await port.completeTotpEnrollment({
        userId: input.userId,
        encryptedSecret: profile.pendingTotpSecretCiphertext,
        recoveryCodeHashes: recoveryCodes.map(hashStaffSecuritySecret),
      });
      return { ok: true as const, recoveryCodes, sessionVersion };
    },

    confirmRecoveryCodes(userId: string) {
      return port.confirmRecoveryCodes(userId);
    },

    async beginLogin(userId: string) {
      const profile = await port.getProfile(userId);
      if (!profile?.factorVerifiedAt) return { required: false as const };
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + LOGIN_CHALLENGE_TTL_MS).toISOString();
      await port.beginLoginChallenge({
        userId,
        challengeHash: hashStaffSecuritySecret(token),
        expiresAt,
      });
      return { required: true as const, token, expiresAt, replacementRequired: profile.replacementRequired };
    },

    async completeLogin(input: { userId: string; token: string; code?: string; recoveryCode?: string }) {
      const profile = await port.getProfile(input.userId);
      const challengeHash = hashStaffSecuritySecret(input.token);
      if (
        !profile?.factorVerifiedAt ||
        profile.loginChallengeHash !== challengeHash ||
        !profile.loginChallengeExpiresAt ||
        Date.parse(profile.loginChallengeExpiresAt) <= Date.now()
      ) {
        return { ok: false as const, error: "login_challenge_expired" as const };
      }
      if (profile.lockedUntil && Date.parse(profile.lockedUntil) > Date.now()) {
        return { ok: false as const, error: "factor_locked" as const, lockedUntil: profile.lockedUntil };
      }
      if (input.recoveryCode) {
        const result = await port.consumeRecoveryLogin({
          userId: input.userId,
          challengeHash,
          recoveryCodeHash: hashStaffSecuritySecret(input.recoveryCode),
        });
        if (!result.ok) {
          const lockedUntil = await port.recordFailedFactorAttempt(input.userId);
          return {
            ok: false as const,
            error: lockedUntil ? "factor_locked" as const : "invalid_recovery_code" as const,
            lockedUntil,
          };
        }
        return { ok: true as const, recoveryMode: true, sessionVersion: result.sessionVersion };
      }
      if (profile.replacementRequired) {
        return { ok: false as const, error: "factor_replacement_required" as const };
      }
      if (!input.code || !profile.totpSecretCiphertext || !verifyTotpCode(decryptTotpSecret(profile.totpSecretCiphertext), input.code)) {
        const lockedUntil = await port.recordFailedFactorAttempt(input.userId);
        return { ok: false as const, error: lockedUntil ? "factor_locked" as const : "invalid_factor" as const, lockedUntil };
      }
      if (!(await port.consumeTotpLogin({ userId: input.userId, challengeHash }))) {
        return { ok: false as const, error: "login_challenge_expired" as const };
      }
      return { ok: true as const, recoveryMode: false, sessionVersion: profile.sessionVersion };
    },

    revokeSessions(userId: string) {
      return port.revokeSessions(userId);
    },
  };
}

export type StaffSecurityService = ReturnType<typeof createStaffSecurityService>;
