import { createHash, randomBytes } from "node:crypto";
import { env } from "@/config/env";
import { integratorWebhookSecret } from "@/config/env";
import { logger } from "@/infra/logging/logger";
import { normalizeMaxBotNicknameInput } from "@/modules/system-settings/maxLoginBotNickname";
import { notifyChannelLinkOwnershipConflictRelay } from "@/modules/admin-incidents/sendAdminIncidentAlerts";
import type { ChannelLinkConflictContext, ChannelLinkDbPort } from "@/modules/auth/channelLinkPort";

const SECRET_TTL_MIN = 10;

let channelLinkDbPort: ChannelLinkDbPort | undefined;

export function bindChannelLinkDbPort(port: ChannelLinkDbPort): void {
  channelLinkDbPort = port;
}

function requireChannelLinkDbPort(): ChannelLinkDbPort {
  if (!channelLinkDbPort) {
    throw new Error("ChannelLinkDbPort is not bound. Call ensureAuthModulePortsBound() from buildAppDeps.");
  }
  return channelLinkDbPort;
}

async function recordChannelLinkOwnershipConflict(
  ctx: ChannelLinkConflictContext,
  options: { classifiedReason: string; stubClassificationReason?: string },
): Promise<void> {
  reportChannelLinkBindingConflict(ctx);
  const up = await requireChannelLinkDbPort().recordOwnershipConflict(ctx, options);
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
  userId: string
): Promise<{ needsPhone: boolean; phoneNormalized?: string }> {
  return requireChannelLinkDbPort().loadPlatformPhoneBindingInfo(userId);
}

/** Canonical platform user has no non-empty phone — мессенджер должен запросить контакт. */
export async function platformUserNeedsPhoneBinding(userId: string): Promise<boolean> {
  const { needsPhone } = await platformPhoneBindingInfo(userId);
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
    await requireChannelLinkDbPort().replaceChannelLinkSecret({
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

  const db = requireChannelLinkDbPort();
  const h = hashToken(trimmed);
  const r = await db.loadChannelLinkSecretByTokenHash({
    channelCode: params.channelCode,
    tokenHash: h,
  });
  if (r === null) {
    return { ok: false, code: "unknown_or_expired" };
  }
  if (r.usedAt) {
    const needsPhone = await platformUserNeedsPhoneBinding(r.userId);
    return { ok: false, code: "used_token", needsPhone };
  }
  if (new Date(r.expiresAt).getTime() < Date.now()) {
    return { ok: false, code: "unknown_or_expired" };
  }

  const boundUserId = await db.loadChannelBindingUserId({
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

      const classification = await db.classifyChannelBindingOwnerForLink(boundUserId);
      if (classification.kind === "real") {
        const merged = await db.tryMergeChannelLinkOwners({
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
          const canonicalAfterMerge = await db.resolveCanonicalUserId(r.userId);
          if (canonicalAfterMerge == null) {
            return { ok: false, code: "user_not_found" };
          }
          const { needsPhone, phoneNormalized } = await platformPhoneBindingInfo(canonicalAfterMerge);
          return {
            ok: true,
            userId: canonicalAfterMerge,
            needsPhone,
            ...(phoneNormalized ? { phoneNormalized } : {}),
          };
        }
        await recordChannelLinkOwnershipConflict(ctx, {
          classifiedReason: merged.reason,
          stubClassificationReason: classification.reason,
        });
        return { ok: false, code: "conflict", mergeReason: merged.reason };
      }

      const claim = await db.claimMessengerChannelBinding({
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
          await recordChannelLinkOwnershipConflict(ctx, {
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
      const canonicalAfterClaim = await db.resolveCanonicalUserId(r.userId);
      if (canonicalAfterClaim == null) {
        return { ok: false, code: "user_not_found" };
      }
      const { needsPhone, phoneNormalized } = await platformPhoneBindingInfo(canonicalAfterClaim);
      return {
        ok: true,
        userId: canonicalAfterClaim,
        needsPhone,
        ...(phoneNormalized ? { phoneNormalized } : {}),
      };
    }
    await db.markChannelLinkSecretUsedIfUnused(r.id);
    const canonical = await db.resolveCanonicalUserId(r.userId);
    if (canonical == null) {
      return { ok: false, code: "user_not_found" };
    }
    const { needsPhone, phoneNormalized } = await platformPhoneBindingInfo(r.userId);
    return { ok: true, userId: canonical, needsPhone, ...(phoneNormalized ? { phoneNormalized } : {}) };
  }

  await db.insertChannelBinding({
    userId: r.userId,
    channelCode: params.channelCode,
    externalId: params.externalId,
  });
  await db.upsertBroadcastDefaultsAfterChannelBind(r.userId, params.channelCode);
  await db.markChannelLinkSecretUsed(r.id);

  const canonical = await db.resolveCanonicalUserId(r.userId);
  if (canonical == null) {
    return { ok: false, code: "user_not_found" };
  }
  const { needsPhone, phoneNormalized } = await platformPhoneBindingInfo(r.userId);
  return { ok: true, userId: canonical, needsPhone, ...(phoneNormalized ? { phoneNormalized } : {}) };
}
