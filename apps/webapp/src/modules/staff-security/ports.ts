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
  ensureProfile(): Promise<StaffSecurityProfile>;
  getProfile(): Promise<StaffSecurityProfile | null>;
  savePendingTotp(encryptedSecret: string): Promise<void>;
  completeTotpEnrollment(input: {
    encryptedSecret: string;
    recoveryCodeHashes: string[];
  }): Promise<number>;
  confirmRecoveryCodes(): Promise<boolean>;
  beginLoginChallenge(input: { challengeHash: string; expiresAt: string }): Promise<void>;
  consumeTotpLogin(input: { challengeHash: string }): Promise<boolean>;
  consumeRecoveryLogin(input: {
    challengeHash: string;
    recoveryCodeHash: string;
  }): Promise<{ ok: boolean; sessionVersion: number }>;
  recordFailedFactorAttempt(): Promise<string | null>;
  revokeSessions(): Promise<number>;
};

export type StaffSecurityCryptoPort = {
  encryptTotpSecret(secret: string): string;
  decryptTotpSecret(envelope: string): string;
  hashRecoveryCode(code: string): string;
  matchRecoveryCodeHash(code: string, storedHashes: readonly string[]): string | null;
  hashLoginChallenge(token: string): string;
  matchesLoginChallenge(token: string, storedHash: string): boolean;
};
