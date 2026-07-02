import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { getPool } from "@/infra/db/client";
import { getWebappSqlDb } from "@/infra/db/runWebappSql";
import {
  upsertOpenConflictLog,
  computeChannelLinkOwnershipConflictKey,
} from "@/infra/adminAuditLog";
import { env } from "@/config/env";
import { integratorWebhookSecret } from "@/config/env";
import { logger } from "@/infra/logging/logger";
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
import { normalizeMaxBotNicknameInput } from "@/modules/system-settings/maxLoginBotNickname";
import { notifyChannelLinkOwnershipConflictRelay } from "@/modules/admin-incidents/sendAdminIncidentAlerts";
import {
  claimMessengerChannelBinding,
  classifyChannelBindingOwnerForLink,
  tryMergeChannelLinkOwners,
} from "@/infra/repos/pgChannelLinkClaim";
import { upsertBroadcastDefaultsAfterChannelBind } from "@/infra/upsertBroadcastDefaultsAfterChannelBind";

const SECRET_TTL_MIN = 10;

/** Structured context for channel-link takeover attempts (never overwrite existing binding). */
export type ChannelLinkConflictContext = {
  channelCode: string;
  externalId: string;
  tokenUserId: string;
  existingUserId: string;
};

async function recordChannelLinkOwnershipConflict(
  pool: Pool,
  ctx: ChannelLinkConflictContext,
  options: { classifiedReason: string; stubClassificationReason?: string },
): Promise<void> {
  reportChannelLinkBindingConflict(ctx);
  const sorted = [ctx.tokenUserId, ctx.existingUserId].map((x) => x.trim()).filter(Boolean).sort();
  const conflictKey = computeChannelLinkOwnershipConflictKey(
    ctx.channelCode,
    ctx.externalId,
    ctx.tokenUserId,
    ctx.existingUserId,
  );
  const up = await upsertOpenConflictLog(pool, {
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
  await notifyChannelLinkOwnershipConflictRelay(up, {
    ...ctx,
    classifiedReason: options.classifiedReason,
  });
}

/**
 * Wire to admin relay (Telegram/Max) + console; tests override via {@link setChannelLinkBindingConflictReporter}.
 */
let reportChannelLinkBindingConflict: (ctx: ChannelLinkConflictContext) => void = (ctx) => {
  console.warn("[channel_link:binding_conflict]", ctx);
};

export function setChannelLinkBindingConflictReporter(
  fn: (ctx: ChannelLinkConflictContext) => void
): void {
  reportChannelLinkBindingConflict = fn;
}

function hashToken(token: string): string {
  return createHash("sha256")
    .update(`${token}:${integratorWebhookSecret() || "dev-channel-link"}`)
    .digest("hex");
}

async function platformPhoneBindingInfo(
  pool: Pool,
  userId: string
): Promise<{ needsPhone: boolean; phoneNormalized?: string }> {
  return loadPlatformPhoneBindingInfo(pool, userId);
}

/** Canonical platform user has no non-empty phone — мессенджер должен запросить контакт. */
export async function platformUserNeedsPhoneBinding(pool: Pool, userId: string): Promise<boolean> {
  const { needsPhone } = await platformPhoneBindingInfo(pool, userId);
  return needsPhone;
}

export type ChannelLinkCompleteResult =
  | { ok: true; userId: string; needsPhone: boolean; phoneNormalized?: string }
  | { ok: false; code: string; needsPhone?: boolean; mergeReason?: string };

export type ChannelLinkStartResult =
  | { ok: true; url: string; expiresAtIso: string; manualCommand?: string }
  | { ok: false; code: "unsupported_channel" | "server_error" };

/** Старт привязки: создаёт одноразовый токен и URL/инструкцию для канала. */
export async function startChannelLink(params: {
  userId: string;
  channelCode: "telegram" | "max" | "vk";
  botUsername: string;
  /** Ник бота MAX для `https://max.ru/<nick>?start=…` (пусто — только команда в чат). */
  maxBotNickname?: string;
}): Promise<ChannelLinkStartResult> {
  if (params.channelCode !== "telegram" && params.channelCode !== "max") {
    return { ok: false, code: "unsupported_channel" };
  }

  const plain = randomBytes(24).toString("base64url");
  const startPayload = `link_${plain}`;
  const expiresAt = new Date(Date.now() + SECRET_TTL_MIN * 60 * 1000);

  const buildResult = (): { url: string; manualCommand?: string } => {
    if (params.channelCode === "telegram") {
      return {
        url: `https://t.me/${params.botUsername}?start=${encodeURIComponent(startPayload)}`,
      };
    }
    const nick = normalizeMaxBotNicknameInput(params.maxBotNickname ?? "");
    if (nick && startPayload.length <= 128) {
      try {
        const u = new URL(`https://max.ru/${encodeURIComponent(nick)}`);
        u.searchParams.set("start", startPayload);
        return {
          url: u.toString(),
          manualCommand: `/start ${startPayload}`,
        };
      } catch {
        /* fall through */
      }
    }
    return {
      url: "https://max.ru/",
      manualCommand: `/start ${startPayload}`,
    };
  };

  if (!env.DATABASE_URL) {
    const result = buildResult();
    return { ok: true, ...result, expiresAtIso: expiresAt.toISOString() };
  }

  try {
    await replaceChannelLinkSecret({
      userId: params.userId,
      channelCode: params.channelCode,
      tokenHash: hashToken(startPayload),
      expiresAtIso: expiresAt.toISOString(),
    });
    const result = buildResult();
    return { ok: true, ...result, expiresAtIso: expiresAt.toISOString() };
  } catch {
    return { ok: false, code: "server_error" };
  }
}

/** Завершение привязки из integrator (M2M): проверка токена и запись user_channel_bindings. */
export async function completeChannelLinkFromIntegrator(params: {
  linkToken: string;
  channelCode: "telegram" | "max";
  externalId: string;
}): Promise<ChannelLinkCompleteResult> {
  const trimmed = params.linkToken.trim();
  if (!/^link_[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { ok: false, code: "invalid_token" };
  }

  if (!env.DATABASE_URL) {
    return { ok: false, code: "database_unavailable" };
  }

  const pool = getPool();
  const h = hashToken(trimmed);
  const r = await loadChannelLinkSecretByTokenHash({
    channelCode: params.channelCode,
    tokenHash: h,
  });
  if (r === null) {
    return { ok: false, code: "unknown_or_expired" };
  }
  if (r.usedAt) {
    const needsPhone = await platformUserNeedsPhoneBinding(pool, r.userId);
    return { ok: false, code: "used_token", needsPhone };
  }
  if (new Date(r.expiresAt).getTime() < Date.now()) {
    return { ok: false, code: "unknown_or_expired" };
  }

  const boundUserId = await loadChannelBindingUserId({
    channelCode: params.channelCode,
    externalId: params.externalId,
  });

  if (boundUserId !== null) {
    if (boundUserId !== r.userId) {
      const ctx: ChannelLinkConflictContext = {
        channelCode: params.channelCode,
        externalId: params.externalId,
        tokenUserId: r.userId,
        existingUserId: boundUserId,
      };

      const classification = await classifyChannelBindingOwnerForLink(getWebappSqlDb(), boundUserId);
      if (classification.kind === "real") {
        const merged = await tryMergeChannelLinkOwners(pool, {
          tokenUserId: r.userId,
          existingUserId: boundUserId,
          secretRowId: r.id,
        });
        if (merged.ok) {
          logger.info({
            scope: "channel_link",
            event: "channel_link_full_merge_applied",
            tokenUserId: r.userId,
            existingUserId: boundUserId,
            channelCode: params.channelCode,
          });
          const canonicalAfterMerge = await resolveCanonicalUserId(pool, r.userId);
          if (canonicalAfterMerge == null) {
            return { ok: false, code: "user_not_found" };
          }
          const { needsPhone, phoneNormalized } = await platformPhoneBindingInfo(pool, canonicalAfterMerge);
          return {
            ok: true,
            userId: canonicalAfterMerge,
            needsPhone,
            ...(phoneNormalized ? { phoneNormalized } : {}),
          };
        }
        await recordChannelLinkOwnershipConflict(pool, ctx, {
          classifiedReason: merged.reason,
          stubClassificationReason: classification.reason,
        });
        return { ok: false, code: "conflict", mergeReason: merged.reason };
      }

      const claim = await claimMessengerChannelBinding(pool, {
        tokenUserId: r.userId,
        stubUserId: boundUserId,
        channelCode: params.channelCode,
        externalId: params.externalId,
        secretRowId: r.id,
      });
      if (!claim.ok) {
        if (claim.code === "rejected") {
          logger.warn({
            scope: "channel_link",
            event: "channel_link_claim_rejected",
            reason: claim.reason,
            channelCode: params.channelCode,
          });
          await recordChannelLinkOwnershipConflict(pool, ctx, {
            classifiedReason: "channel_link_claim_rejected",
            stubClassificationReason: claim.reason,
          });
          return { ok: false, code: "conflict", mergeReason: "channel_link_claim_rejected" };
        }
        logger.error({
          err: claim.err,
          scope: "channel_link",
          event: "channel_link_claim_tx_error",
          tokenUserId: r.userId,
          stubUserId: boundUserId,
        });
        return { ok: false, code: "conflict", mergeReason: "channel_link_claim_failed" };
      }

      logger.info({
        scope: "channel_link",
        event: "channel_link_claim_applied",
        tokenUserId: r.userId,
        stubUserId: boundUserId,
        channelCode: params.channelCode,
      });
      const canonicalAfterClaim = await resolveCanonicalUserId(pool, r.userId);
      if (canonicalAfterClaim == null) {
        return { ok: false, code: "user_not_found" };
      }
      const { needsPhone, phoneNormalized } = await platformPhoneBindingInfo(pool, canonicalAfterClaim);
      return {
        ok: true,
        userId: canonicalAfterClaim,
        needsPhone,
        ...(phoneNormalized ? { phoneNormalized } : {}),
      };
    }
    await markChannelLinkSecretUsedIfUnused(r.id);
    const canonical = await resolveCanonicalUserId(pool, r.userId);
    if (canonical == null) {
      return { ok: false, code: "user_not_found" };
    }
    const { needsPhone, phoneNormalized } = await platformPhoneBindingInfo(pool, r.userId);
    return { ok: true, userId: canonical, needsPhone, ...(phoneNormalized ? { phoneNormalized } : {}) };
  }

  await insertChannelBinding({
    userId: r.userId,
    channelCode: params.channelCode,
    externalId: params.externalId,
  });
  await upsertBroadcastDefaultsAfterChannelBind(pool, r.userId, params.channelCode);
  await markChannelLinkSecretUsed(r.id);

  const canonical = await resolveCanonicalUserId(pool, r.userId);
  if (canonical == null) {
    return { ok: false, code: "user_not_found" };
  }
  const { needsPhone, phoneNormalized } = await platformPhoneBindingInfo(pool, r.userId);
  return { ok: true, userId: canonical, needsPhone, ...(phoneNormalized ? { phoneNormalized } : {}) };
}
