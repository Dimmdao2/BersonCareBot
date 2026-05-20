import type { PoolClient } from "pg";

export type PhoneMessengerBindPurpose = "login" | "profile_bind";
export type PhoneMessengerBindChannel = "telegram" | "max";

export type PhoneMessengerBindStatus =
  | "pending_contact"
  | "otp_ready"
  | "failed"
  | "consumed"
  | "expired";

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

export interface PhoneMessengerBindPort {
  findByTokenHash(tokenHash: string): Promise<PhoneMessengerBindSecretRow | null>;
  deletePending(
    phoneNormalized: string,
    channelCode: PhoneMessengerBindChannel,
    purpose: PhoneMessengerBindPurpose,
  ): Promise<void>;
  insertSecret(params: {
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
  markConsumedByChallenge(challengeId: string): Promise<void>;
  withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
}
