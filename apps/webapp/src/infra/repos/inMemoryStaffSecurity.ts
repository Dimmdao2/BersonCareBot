import type { StaffSecurityPort, StaffSecurityProfile } from '@/modules/staff-security/ports';

const profiles = new Map<string, StaffSecurityProfile>();

function fresh(userId: string): StaffSecurityProfile {
  return {
    userId,
    factorType: null,
    totpSecretCiphertext: null,
    pendingTotpSecretCiphertext: null,
    factorVerifiedAt: null,
    recoveryCodeHashes: [],
    recoveryCodesConfirmedAt: null,
    replacementRequired: false,
    failedAttempts: 0,
    lockedUntil: null,
    sessionVersion: 0,
    loginChallengeHash: null,
    loginChallengeExpiresAt: null,
  };
}

export function resetInMemoryStaffSecurityForTests(): void {
  profiles.clear();
}

export function createInMemoryStaffSecurityPort(
  selfUserId = '11111111-1111-4111-8111-111111111111',
): StaffSecurityPort {
  return {
    async ensureProfile() {
      const profile = profiles.get(selfUserId) ?? fresh(selfUserId);
      profiles.set(selfUserId, profile);
      return { ...profile, recoveryCodeHashes: [...profile.recoveryCodeHashes] };
    },
    async getProfile() {
      const profile = profiles.get(selfUserId);
      return profile ? { ...profile, recoveryCodeHashes: [...profile.recoveryCodeHashes] } : null;
    },
    async savePendingTotp(encryptedSecret) {
      const profile = profiles.get(selfUserId) ?? fresh(selfUserId);
      profiles.set(selfUserId, {
        ...profile,
        pendingTotpSecretCiphertext: encryptedSecret,
        failedAttempts: 0,
        lockedUntil: null,
      });
    },
    async completeTotpEnrollment({ encryptedSecret, recoveryCodeHashes }) {
      const profile = profiles.get(selfUserId);
      if (!profile || profile.pendingTotpSecretCiphertext !== encryptedSecret)
        throw new Error('staff_security_enrollment_conflict');
      profile.factorType = 'totp';
      profile.totpSecretCiphertext = encryptedSecret;
      profile.pendingTotpSecretCiphertext = null;
      profile.factorVerifiedAt = new Date().toISOString();
      profile.recoveryCodeHashes = [...recoveryCodeHashes];
      profile.recoveryCodesConfirmedAt = null;
      profile.replacementRequired = false;
      profile.failedAttempts = 0;
      profile.lockedUntil = null;
      profile.sessionVersion += 1;
      return profile.sessionVersion;
    },
    async confirmRecoveryCodes() {
      const profile = profiles.get(selfUserId);
      if (!profile?.factorVerifiedAt || profile.recoveryCodeHashes.length === 0) return false;
      profile.recoveryCodesConfirmedAt = new Date().toISOString();
      return true;
    },
    async beginLoginChallenge({ challengeHash, expiresAt }) {
      const profile = profiles.get(selfUserId);
      if (!profile?.factorVerifiedAt) throw new Error('staff_security_factor_not_enrolled');
      profile.loginChallengeHash = challengeHash;
      profile.loginChallengeExpiresAt = expiresAt;
    },
    async consumeTotpLogin({ challengeHash }) {
      const profile = profiles.get(selfUserId);
      if (
        !profile ||
        profile.loginChallengeHash !== challengeHash ||
        !profile.loginChallengeExpiresAt ||
        Date.parse(profile.loginChallengeExpiresAt) <= Date.now() ||
        (profile.lockedUntil !== null && Date.parse(profile.lockedUntil) > Date.now())
      )
        return false;
      profile.loginChallengeHash = null;
      profile.loginChallengeExpiresAt = null;
      profile.failedAttempts = 0;
      profile.lockedUntil = null;
      return true;
    },
    async consumeRecoveryLogin({ challengeHash, recoveryCodeHash }) {
      const profile = profiles.get(selfUserId);
      if (
        !profile ||
        profile.loginChallengeHash !== challengeHash ||
        !profile.loginChallengeExpiresAt ||
        Date.parse(profile.loginChallengeExpiresAt) <= Date.now() ||
        (profile.lockedUntil !== null && Date.parse(profile.lockedUntil) > Date.now())
      )
        return { ok: false, sessionVersion: profile?.sessionVersion ?? 0 };
      const index = profile.recoveryCodeHashes.indexOf(recoveryCodeHash);
      if (index < 0) return { ok: false, sessionVersion: profile.sessionVersion };
      profile.recoveryCodeHashes.splice(index, 1);
      profile.replacementRequired = true;
      profile.sessionVersion += 1;
      profile.loginChallengeHash = null;
      profile.loginChallengeExpiresAt = null;
      return { ok: true, sessionVersion: profile.sessionVersion };
    },
    async recordFailedFactorAttempt() {
      const profile = profiles.get(selfUserId);
      if (!profile) return null;
      if (profile.lockedUntil && Date.parse(profile.lockedUntil) <= Date.now()) {
        profile.failedAttempts = 0;
        profile.lockedUntil = null;
      }
      profile.failedAttempts += 1;
      if (profile.failedAttempts >= 5)
        profile.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      return profile.lockedUntil;
    },
    async revokeSessions() {
      const profile = profiles.get(selfUserId);
      if (!profile) throw new Error('staff_security_profile_missing');
      profile.sessionVersion += 1;
      profile.loginChallengeHash = null;
      profile.loginChallengeExpiresAt = null;
      return profile.sessionVersion;
    },
  };
}
