import { getPool } from "@/infra/db/client";
import { getWebappSqlDb } from "@/infra/db/runWebappSql";
import {
  computeChannelLinkOwnershipConflictKey,
  upsertOpenConflictLog,
} from "@/infra/adminAuditLog";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import {
  insertChannelBinding,
  loadChannelBindingUserId,
  loadChannelLinkSecretByTokenHash,
  loadPlatformPhoneBindingInfo,
  markChannelLinkSecretUsed,
  markChannelLinkSecretUsedIfUnused,
  replaceChannelLinkSecret,
} from "@/infra/repos/pgChannelLinkStart";
import {
  claimMessengerChannelBinding,
  classifyChannelBindingOwnerForLink,
  tryMergeChannelLinkOwners,
} from "@/infra/repos/pgChannelLinkClaim";
import { upsertBroadcastDefaultsAfterChannelBind } from "@/infra/upsertBroadcastDefaultsAfterChannelBind";
import type { ChannelLinkDbPort } from "@/modules/auth/channelLinkPort";

export const pgChannelLinkDbPort: ChannelLinkDbPort = {
  replaceChannelLinkSecret,
  loadPlatformPhoneBindingInfo: (userId) => loadPlatformPhoneBindingInfo(getPool(), userId),
  loadChannelLinkSecretByTokenHash,
  loadChannelBindingUserId,
  classifyChannelBindingOwnerForLink: (boundUserId) =>
    classifyChannelBindingOwnerForLink(getWebappSqlDb(), boundUserId),
  tryMergeChannelLinkOwners: (params) => tryMergeChannelLinkOwners(getPool(), params),
  claimMessengerChannelBinding: (params) => claimMessengerChannelBinding(getPool(), params),
  markChannelLinkSecretUsedIfUnused,
  insertChannelBinding,
  upsertBroadcastDefaultsAfterChannelBind: (userId, channelCode) =>
    upsertBroadcastDefaultsAfterChannelBind(getPool(), userId, channelCode),
  markChannelLinkSecretUsed,
  resolveCanonicalUserId: (userId) => resolveCanonicalUserId(getPool(), userId),
  async recordOwnershipConflict(ctx, options) {
    const sorted = [ctx.tokenUserId, ctx.existingUserId].map((x) => x.trim()).filter(Boolean).sort();
    const conflictKey = computeChannelLinkOwnershipConflictKey(
      ctx.channelCode,
      ctx.externalId,
      ctx.tokenUserId,
      ctx.existingUserId,
    );
    return upsertOpenConflictLog(getPool(), {
      actorId: null,
      action: "channel_link_ownership_conflict",
      conflictKey,
      candidateIds: sorted,
      targetId: ctx.tokenUserId,
      details: {
        source: "channel_link",
        classifiedReason: options.classifiedReason,
        ...(options.stubClassificationReason
          ? { stubClassificationReason: options.stubClassificationReason }
          : {}),
        channelCode: ctx.channelCode,
        externalId: ctx.externalId,
      },
      status: "error",
    });
  },
};
