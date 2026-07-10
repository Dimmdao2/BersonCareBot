export type ChannelLinkChannelCode = "telegram" | "max";

export type ChannelLinkSecretRow = {
  id: string;
  userId: string;
  expiresAt: string;
  usedAt: string | null;
};

export type ChannelLinkPhoneBindingInfo = {
  needsPhone: boolean;
  phoneNormalized?: string;
};

export type ChannelBindingOwnerClass =
  | { kind: "disposable" }
  | { kind: "real"; reason: string };

export type ChannelLinkOwnersMergeResult =
  | { ok: true }
  | { ok: false; reason: string; candidateIds: string[] };

export type ClaimMessengerChannelBindingResult =
  | { ok: true }
  | { ok: false; code: "rejected"; reason: string }
  | { ok: false; code: "failed"; err: unknown };

export type ChannelLinkConflictRecordResult =
  | { kind: "anomaly" }
  | { kind: "conflict"; insertedFirst: boolean }
  | { kind: "skipped" };

export type ChannelLinkConflictContext = {
  channelCode: string;
  externalId: string;
  tokenUserId: string;
  existingUserId: string;
};

export type ChannelLinkDbPort = {
  replaceChannelLinkSecret(params: {
    userId: string;
    channelCode: ChannelLinkChannelCode;
    tokenHash: string;
    expiresAtIso: string;
  }): Promise<void>;
  loadPlatformPhoneBindingInfo(userId: string): Promise<ChannelLinkPhoneBindingInfo>;
  loadChannelLinkSecretByTokenHash(params: {
    channelCode: ChannelLinkChannelCode;
    tokenHash: string;
  }): Promise<ChannelLinkSecretRow | null>;
  loadChannelBindingUserId(params: {
    channelCode: ChannelLinkChannelCode;
    externalId: string;
  }): Promise<string | null>;
  classifyChannelBindingOwnerForLink(boundUserId: string): Promise<ChannelBindingOwnerClass>;
  tryMergeChannelLinkOwners(params: {
    tokenUserId: string;
    existingUserId: string;
    secretRowId: string;
  }): Promise<ChannelLinkOwnersMergeResult>;
  claimMessengerChannelBinding(params: {
    tokenUserId: string;
    stubUserId: string;
    channelCode: ChannelLinkChannelCode;
    externalId: string;
    secretRowId: string;
  }): Promise<ClaimMessengerChannelBindingResult>;
  markChannelLinkSecretUsedIfUnused(secretRowId: string): Promise<void>;
  insertChannelBinding(params: {
    userId: string;
    channelCode: ChannelLinkChannelCode;
    externalId: string;
  }): Promise<void>;
  upsertBroadcastDefaultsAfterChannelBind(userId: string, channelCode: ChannelLinkChannelCode): Promise<void>;
  markChannelLinkSecretUsed(secretRowId: string): Promise<void>;
  resolveCanonicalUserId(userId: string): Promise<string | null>;
  recordOwnershipConflict(
    ctx: ChannelLinkConflictContext,
    options: { classifiedReason: string; stubClassificationReason?: string },
  ): Promise<ChannelLinkConflictRecordResult>;
};
