import { randomBytes } from 'node:crypto';
import type { StaffSecurityCryptoPort, StaffSecurityPort, StaffSecurityStatus } from './ports';
import { buildTotpUri, generateRecoveryCodes, generateTotpSecret, verifyTotpCode } from './totp';

const LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function statusOf(
  profile: Awaited<ReturnType<StaffSecurityPort['ensureProfile']>>,
): StaffSecurityStatus {
  return {
    enrolled: profile.factorType === 'totp' && profile.factorVerifiedAt !== null,
    recoveryConfirmed: profile.recoveryCodesConfirmedAt !== null,
    replacementRequired: profile.replacementRequired,
    lockedUntil: profile.lockedUntil,
    sessionVersion: profile.sessionVersion,
  };
}

export function createStaffSecurityService(
  port: StaffSecurityPort,
  crypto: StaffSecurityCryptoPort,
) {
  return {
    async ensureProfile(): Promise<StaffSecurityStatus> {
      return statusOf(await port.ensureProfile());
    },

    async getStatus(): Promise<StaffSecurityStatus | null> {
      const profile = await port.getProfile();
      return profile ? statusOf(profile) : null;
    },

    async startTotpEnrollment(input: { email: string }) {
      const profile = await port.ensureProfile();
      if (
        profile.factorVerifiedAt &&
        profile.recoveryCodesConfirmedAt &&
        !profile.replacementRequired
      ) {
        return { ok: false as const, error: 'factor_already_enrolled' as const };
      }
      const secret = generateTotpSecret();
      await port.savePendingTotp(crypto.encryptTotpSecret(secret));
      return { ok: true as const, secret, uri: buildTotpUri({ secret, email: input.email }) };
    },

    async verifyTotpEnrollment(input: { code: string }) {
      const profile = await port.getProfile();
      if (!profile?.pendingTotpSecretCiphertext) {
        return { ok: false as const, error: 'enrollment_not_started' as const };
      }
      if (profile.lockedUntil && Date.parse(profile.lockedUntil) > Date.now()) {
        return {
          ok: false as const,
          error: 'factor_locked' as const,
          lockedUntil: profile.lockedUntil,
        };
      }
      if (
        !verifyTotpCode(crypto.decryptTotpSecret(profile.pendingTotpSecretCiphertext), input.code)
      ) {
        const lockedUntil = await port.recordFailedFactorAttempt();
        return {
          ok: false as const,
          error: lockedUntil ? ('factor_locked' as const) : ('invalid_factor' as const),
          lockedUntil,
        };
      }
      const recoveryCodes = generateRecoveryCodes();
      const sessionVersion = await port.completeTotpEnrollment({
        encryptedSecret: profile.pendingTotpSecretCiphertext,
        recoveryCodeHashes: recoveryCodes.map(crypto.hashRecoveryCode),
      });
      return { ok: true as const, recoveryCodes, sessionVersion };
    },

    confirmRecoveryCodes() {
      return port.confirmRecoveryCodes();
    },

    async beginLogin() {
      const profile = await port.getProfile();
      if (!profile?.factorVerifiedAt) return { required: false as const };
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + LOGIN_CHALLENGE_TTL_MS).toISOString();
      await port.beginLoginChallenge({
        challengeHash: crypto.hashLoginChallenge(token),
        expiresAt,
      });
      return {
        required: true as const,
        token,
        expiresAt,
        replacementRequired: profile.replacementRequired,
      };
    },

    async completeLogin(input: { token: string; code?: string; recoveryCode?: string }) {
      const profile = await port.getProfile();
      if (
        !profile?.factorVerifiedAt ||
        !profile.loginChallengeHash ||
        !crypto.matchesLoginChallenge(input.token, profile.loginChallengeHash) ||
        !profile.loginChallengeExpiresAt ||
        Date.parse(profile.loginChallengeExpiresAt) <= Date.now()
      ) {
        return { ok: false as const, error: 'login_challenge_expired' as const };
      }
      if (profile.lockedUntil && Date.parse(profile.lockedUntil) > Date.now()) {
        return {
          ok: false as const,
          error: 'factor_locked' as const,
          lockedUntil: profile.lockedUntil,
        };
      }
      if (input.recoveryCode) {
        const recoveryCodeHash =
          crypto.matchRecoveryCodeHash(input.recoveryCode, profile.recoveryCodeHashes) ??
          crypto.hashRecoveryCode(`invalid:${input.recoveryCode}`);
        const result = await port.consumeRecoveryLogin({
          challengeHash: profile.loginChallengeHash,
          recoveryCodeHash,
        });
        if (!result.ok) {
          const lockedUntil = await port.recordFailedFactorAttempt();
          return {
            ok: false as const,
            error: lockedUntil ? ('factor_locked' as const) : ('invalid_recovery_code' as const),
            lockedUntil,
          };
        }
        return { ok: true as const, recoveryMode: true, sessionVersion: result.sessionVersion };
      }
      if (profile.replacementRequired) {
        return { ok: false as const, error: 'factor_replacement_required' as const };
      }
      if (
        !input.code ||
        !profile.totpSecretCiphertext ||
        !verifyTotpCode(crypto.decryptTotpSecret(profile.totpSecretCiphertext), input.code)
      ) {
        const lockedUntil = await port.recordFailedFactorAttempt();
        return {
          ok: false as const,
          error: lockedUntil ? ('factor_locked' as const) : ('invalid_factor' as const),
          lockedUntil,
        };
      }
      if (!(await port.consumeTotpLogin({ challengeHash: profile.loginChallengeHash }))) {
        return { ok: false as const, error: 'login_challenge_expired' as const };
      }
      return {
        ok: true as const,
        recoveryMode: false,
        recoveryConfirmed: profile.recoveryCodesConfirmedAt !== null,
        sessionVersion: profile.sessionVersion,
      };
    },

    revokeSessions() {
      return port.revokeSessions();
    },
  };
}

export type StaffSecurityService = ReturnType<typeof createStaffSecurityService>;
