import { createHash } from 'node:crypto';

export const PASSWORD_LOCK_ATTEMPTS = 10;
export const PASSWORD_LOCK_SECONDS = 15 * 60;

export type PasswordAltchaProof = {
  challengeId: string;
  challengeDigest: string;
};

export type PasswordFailureState = {
  attempts: number;
  retryAfterSeconds: number;
  captchaRequired: boolean;
  captchaRefreshRequired: boolean;
  locked: boolean;
};

export type PasswordVerificationResult =
  | { ok: true; userId: string; emailVerified: boolean }
  | ({ ok: false } & PasswordFailureState);

export function passwordIdentifierKey(emailNormalized: string): string {
  return `password-email:v1:${createHash('sha256').update(emailNormalized).digest('hex')}`;
}

export function passwordFailureDelaySeconds(attempts: number): number {
  if (attempts < 5 || attempts >= PASSWORD_LOCK_ATTEMPTS) return 0;
  return 30 * 2 ** (attempts - 5);
}

/** Kept for old test harnesses; production state is exclusively in PostgreSQL. */
export function resetPasswordLoginProtectionMemoryForTests(): void {}
