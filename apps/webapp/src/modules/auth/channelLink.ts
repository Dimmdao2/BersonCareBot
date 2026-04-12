import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { getPool } from "@/infra/db/client";
import { env } from "@/config/env";
import { integratorWebhookSecret } from "@/config/env";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";

const SECRET_TTL_MIN = 10;

/** Structured context for channel-link takeover attempts (never overwrite existing binding). */
export type ChannelLinkConflictContext = {
  channelCode: string;
  externalId: string;
  tokenUserId: string;
  existingUserId: string;
};

/**
 * TODO(AUDIT-BACKLOG-023): wire to admin + user notification pipeline (legacy E-R1.1; USER_TODO_STAGE: конфликт привязки).
 * Replace in DI/bootstrap when notifications exist.
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
  const canonical = await resolveCanonicalUserId(pool, userId);
  const res = await pool.query<{ phone_normalized: string | null }>(
    `SELECT phone_normalized FROM platform_users WHERE id = $1::uuid`,
    [canonical],
  );
  const p = res.rows[0]?.phone_normalized;
  const phoneNormalized = typeof p === "string" && p.trim().length > 0 ? p.trim() : undefined;
  return { needsPhone: phoneNormalized === undefined, phoneNormalized };
}

/** Canonical platform user has no non-empty phone — мессенджер должен запросить контакт. */
export async function platformUserNeedsPhoneBinding(pool: Pool, userId: string): Promise<boolean> {
  const { needsPhone } = await platformPhoneBindingInfo(pool, userId);
  return needsPhone;
}

export type ChannelLinkCompleteResult =
  | { ok: true; userId: string; needsPhone: boolean; phoneNormalized?: string }
  | { ok: false; code: string; needsPhone?: boolean };

export type ChannelLinkStartResult =
  | { ok: true; url: string; expiresAtIso: string; manualCommand?: string }
  | { ok: false; code: "unsupported_channel" | "server_error" };

/** Старт привязки: создаёт одноразовый токен и URL/инструкцию для канала. */
export async function startChannelLink(params: {
  userId: string;
  channelCode: "telegram" | "max" | "vk";
  botUsername: string;
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
    // MAX currently relies on manual command input in chat with bot.
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
    const pool = getPool();
    await pool.query("DELETE FROM channel_link_secrets WHERE user_id = $1 AND channel_code = $2", [
      params.userId,
      params.channelCode,
    ]);
    await pool.query(
      `INSERT INTO channel_link_secrets (user_id, channel_code, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [params.userId, params.channelCode, hashToken(startPayload), expiresAt.toISOString()]
    );
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
  const row = await pool.query<{
    id: string;
    user_id: string;
    expires_at: string;
    used_at: string | null;
  }>(
    `SELECT id, user_id, expires_at, used_at FROM channel_link_secrets
     WHERE channel_code = $1 AND token_hash = $2`,
    [params.channelCode, h]
  );
  if (row.rows.length === 0) {
    return { ok: false, code: "unknown_or_expired" };
  }
  const r = row.rows[0];
  if (r.used_at) {
    const needsPhone = await platformUserNeedsPhoneBinding(pool, r.user_id);
    return { ok: false, code: "used_token", needsPhone };
  }
  if (new Date(r.expires_at).getTime() < Date.now()) {
    return { ok: false, code: "unknown_or_expired" };
  }

  const existing = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2`,
    [params.channelCode, params.externalId]
  );

  if (existing.rows.length > 0) {
    const boundUserId = existing.rows[0].user_id;
    if (boundUserId !== r.user_id) {
      reportChannelLinkBindingConflict({
        channelCode: params.channelCode,
        externalId: params.externalId,
        tokenUserId: r.user_id,
        existingUserId: boundUserId,
      });
      return { ok: false, code: "conflict" };
    }
    await pool.query("UPDATE channel_link_secrets SET used_at = now() WHERE id = $1 AND used_at IS NULL", [
      r.id,
    ]);
    const canonical = await resolveCanonicalUserId(pool, r.user_id);
    if (canonical == null) {
      return { ok: false, code: "user_not_found" };
    }
    const { needsPhone, phoneNormalized } = await platformPhoneBindingInfo(pool, r.user_id);
    return { ok: true, userId: canonical, needsPhone, ...(phoneNormalized ? { phoneNormalized } : {}) };
  }

  await pool.query(
    `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
     VALUES ($1, $2, $3)`,
    [r.user_id, params.channelCode, params.externalId]
  );
  await pool.query("UPDATE channel_link_secrets SET used_at = now() WHERE id = $1", [r.id]);

  const canonical = await resolveCanonicalUserId(pool, r.user_id);
  if (canonical == null) {
    return { ok: false, code: "user_not_found" };
  }
  const { needsPhone, phoneNormalized } = await platformPhoneBindingInfo(pool, r.user_id);
  return { ok: true, userId: canonical, needsPhone, ...(phoneNormalized ? { phoneNormalized } : {}) };
}
