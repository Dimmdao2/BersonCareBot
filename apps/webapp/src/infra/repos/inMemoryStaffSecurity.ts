import type { StaffSecurityPort, StaffSecurityProfile } from "@/modules/staff-security/ports";

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

export function createInMemoryStaffSecurityPort(): StaffSecurityPort {
  return {
    async ensureProfile(userId) {
      const profile = profiles.get(userId) ?? fresh(userId);
      profiles.set(userId, profile);
      return { ...profile, recoveryCodeHashes: [...profile.recoveryCodeHashes] };
    },
    async getProfile(userId) {
      const profile = profiles.get(userId);
      return profile ? { ...profile, recoveryCodeHashes: [...profile.recoveryCodeHashes] } : null;
    },
    async savePendingTotp(userId, encryptedSecret) {
      const profile = profiles.get(userId) ?? fresh(userId);
      profiles.set(userId, {
        ...profile,
        pendingTotpSecretCiphertext: encryptedSecret,
        failedAttempts: 0,
        lockedUntil: null,
      });
    },
    async completeTotpEnrollment({ userId, encryptedSecret, recoveryCodeHashes }) {
      const profile = profiles.get(userId);
      if (
        !profile ||
        profile.pendingTotpSecretCiphertext !== encryptedSecret
      ) throw new Error("staff_security_enrollment_conflict");
      profile.factorType = "totp";
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
    async confirmRecoveryCodes(userId) {
      const profile = profiles.get(userId);
      if (!profile?.factorVerifiedAt || profile.recoveryCodeHashes.length === 0) return false;
      profile.recoveryCodesConfirmedAt = new Date().toISOString();
      return true;
    },
    async beginLoginChallenge({ userId, challengeHash, expiresAt }) {
      const profile = profiles.get(userId);
      if (!profile?.factorVerifiedAt) throw new Error("staff_security_factor_not_enrolled");
      profile.loginChallengeHash = challengeHash;
      profile.loginChallengeExpiresAt = expiresAt;
    },
    async consumeTotpLogin({ userId, challengeHash }) {
      const profile = profiles.get(userId);
      if (
        !profile ||
        profile.loginChallengeHash !== challengeHash ||
        !profile.loginChallengeExpiresAt ||
        Date.parse(profile.loginChallengeExpiresAt) <= Date.now() ||
        (profile.lockedUntil !== null && Date.parse(profile.lockedUntil) > Date.now())
      ) return false;
      profile.loginChallengeHash = null;
      profile.loginChallengeExpiresAt = null;
      profile.failedAttempts = 0;
      profile.lockedUntil = null;
      return true;
    },
    async consumeRecoveryLogin({ userId, challengeHash, recoveryCodeHash }) {
      const profile = profiles.get(userId);
      if (
        !profile ||
        profile.loginChallengeHash !== challengeHash ||
        !profile.loginChallengeExpiresAt ||
        Date.parse(profile.loginChallengeExpiresAt) <= Date.now() ||
        (profile.lockedUntil !== null && Date.parse(profile.lockedUntil) > Date.now())
      ) return { ok: false, sessionVersion: profile?.sessionVersion ?? 0 };
      const index = profile.recoveryCodeHashes.indexOf(recoveryCodeHash);
      if (index < 0) return { ok: false, sessionVersion: profile.sessionVersion };
      profile.recoveryCodeHashes.splice(index, 1);
      profile.replacementRequired = true;
      profile.sessionVersion += 1;
      profile.loginChallengeHash = null;
      profile.loginChallengeExpiresAt = null;
      return { ok: true, sessionVersion: profile.sessionVersion };
    },
    async recordFailedFactorAttempt(userId) {
      const profile = profiles.get(userId);
      if (!profile) return null;
      if (profile.lockedUntil && Date.parse(profile.lockedUntil) <= Date.now()) {
        profile.failedAttempts = 0;
        profile.lockedUntil = null;
      }
      profile.failedAttempts += 1;
      if (profile.failedAttempts >= 5) profile.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      return profile.lockedUntil;
    },
    async revokeSessions(userId) {
      const profile = profiles.get(userId);
      if (!profile) throw new Error("staff_security_profile_missing");
      profile.sessionVersion += 1;
      profile.loginChallengeHash = null;
      profile.loginChallengeExpiresAt = null;
      return profile.sessionVersion;
    },
  };
}
