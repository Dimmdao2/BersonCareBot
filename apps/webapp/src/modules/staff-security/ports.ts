export type StaffSecurityProfile = {
  userId: string;
  factorType: "totp" | null;
  totpSecretCiphertext: string | null;
  pendingTotpSecretCiphertext: string | null;
  factorVerifiedAt: string | null;
  recoveryCodeHashes: string[];
  recoveryCodesConfirmedAt: string | null;
  replacementRequired: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  sessionVersion: number;
  loginChallengeHash: string | null;
  loginChallengeExpiresAt: string | null;
};

export type StaffSecurityStatus = {
  enrolled: boolean;
  recoveryConfirmed: boolean;
  replacementRequired: boolean;
  lockedUntil: string | null;
  sessionVersion: number;
};

export type StaffSecurityPort = {
  ensureProfile(userId: string): Promise<StaffSecurityProfile>;
  getProfile(userId: string): Promise<StaffSecurityProfile | null>;
  savePendingTotp(userId: string, encryptedSecret: string): Promise<void>;
  completeTotpEnrollment(input: {
    userId: string;
    encryptedSecret: string;
    recoveryCodeHashes: string[];
  }): Promise<number>;
  confirmRecoveryCodes(userId: string): Promise<boolean>;
  beginLoginChallenge(input: { userId: string; challengeHash: string; expiresAt: string }): Promise<void>;
  consumeTotpLogin(input: { userId: string; challengeHash: string }): Promise<boolean>;
  consumeRecoveryLogin(input: {
    userId: string;
    challengeHash: string;
    recoveryCodeHash: string;
  }): Promise<{ ok: boolean; sessionVersion: number }>;
  recordFailedFactorAttempt(userId: string): Promise<string | null>;
  revokeSessions(userId: string): Promise<number>;
};
