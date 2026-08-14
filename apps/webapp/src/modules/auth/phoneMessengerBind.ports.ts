import type { PoolClient } from 'pg';

export type PhoneMessengerBindPurpose = 'login' | 'profile_bind';
export type PhoneMessengerBindChannel = 'telegram' | 'max';

export type PhoneMessengerBindStatus =
  'pending_contact' | 'otp_ready' | 'failed' | 'consumed' | 'expired';

export type PhoneMessengerBindSecretRow = {
  id: string;
  phone_normalized: string;
  channel_code: string;
  purpose: string;
  user_id: string | null;
  status: string;
  challenge_id: string | null;
  failure_code: string | null;
  expires_at: string;
  consumed_at: string | null;
};

export type PhoneMessengerBindPreOtpFailure = {
  ok: false;
  code: string;
  candidateIds?: string[];
};

export interface PhoneMessengerBindPort {
  findByTokenHash(tokenHash: string): Promise<PhoneMessengerBindSecretRow | null>;
  startSecret(params: {
    tokenHash: string;
    phoneNormalized: string;
    channelCode: PhoneMessengerBindChannel;
    purpose: PhoneMessengerBindPurpose;
    userId: string | null;
    expiresAtIso: string;
  }): Promise<void>;
  updateExpired(id: string): Promise<void>;
  updateFailed(id: string, failureCode: string): Promise<void>;
  updateOtpReady(id: string, challengeId: string): Promise<void>;
  markConsumed(id: string): Promise<void>;
  markConsumedByChallenge(challengeId: string): Promise<void>;
  verifyCompletionState(params: {
    tokenHash: string;
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
    contactPhoneNormalized: string;
  }): Promise<{
    ready: boolean;
    accountCreated: boolean;
    syncTargetUserId: string | null;
    canonicalUserId: string | null;
  }>;
  withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  applyMessengerContactPreOtp(
    client: PoolClient,
    params: {
      phoneNormalized: string;
      channelCode: PhoneMessengerBindChannel;
      externalId: string;
      purpose: PhoneMessengerBindPurpose;
      sessionUserId?: string | null;
    },
  ): Promise<{ ok: true; accountCreated: boolean } | PhoneMessengerBindPreOtpFailure>;
  recordMessengerBindBlocked?(
    client: PoolClient,
    params: {
      reason: string;
      candidateIds: string[];
      channelCode: PhoneMessengerBindChannel;
      externalId: string;
      phoneNormalized: string;
      source: string;
    },
  ): Promise<void>;
}
