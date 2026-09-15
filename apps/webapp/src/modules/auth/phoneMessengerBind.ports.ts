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
  claimed_external_id: string | null;
  claimed_at: string | null;
  expires_at: string;
  consumed_at: string | null;
};

export type PhoneMessengerBindClaimRow = PhoneMessengerBindSecretRow & { token_hash: string };

export interface PhoneMessengerBindPort {
  findByTokenHash(tokenHash: string): Promise<PhoneMessengerBindSecretRow | null>;
  claimToken(params: {
    tokenHash: string;
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
  }): Promise<{ ok: boolean; code: string }>;
  findLiveClaim(params: {
    tokenHash?: string;
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
  }): Promise<PhoneMessengerBindClaimRow | null>;
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
}
