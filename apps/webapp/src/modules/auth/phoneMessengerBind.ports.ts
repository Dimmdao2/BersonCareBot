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

export type PhoneMessengerBindPreOtpFailure = {
  ok: false;
  code: string;
  candidateIds?: string[];
};

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
  /**
   * D15b/6 messenger confirm-path correction: this used to run inside a caller-supplied
   * `withTransaction` on a raw relation transaction the bootstrap principal has no door for
   * (§`pre_session_messenger_channel_resolve` migration header). It is now a standalone atomic
   * named-root call — no caller-supplied transaction — exactly like `pgUserByPhone.findByPhone`/
   * `createOrBind`'s plain-phone branch. D15b/6 conflict-audit correction (2026-08-21): a conflict
   * outcome is ALSO durably recorded (`messenger_phone_bind_blocked` in `admin_audit_log`) by the
   * same named root, atomically — the port no longer exposes a `withTransaction`/
   * `recordMessengerBindBlocked` pair for the caller to (fail to) do that itself.
   */
  /** Authenticated profile bind only. Login proof must not create or bind an account before web finish. */
  applyMessengerContactPreOtp(params: {
    phoneNormalized: string;
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
    sessionUserId?: string | null;
  }): Promise<{ ok: true; accountCreated: boolean } | PhoneMessengerBindPreOtpFailure>;
}
