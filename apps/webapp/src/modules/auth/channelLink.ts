import { createHash, randomBytes } from "node:crypto";
import { getPool } from "@/infra/db/client";
import { env } from "@/config/env";
import { integratorWebhookSecret } from "@/config/env";

const SECRET_TTL_MIN = 15;

function hashToken(token: string): string {
  return createHash("sha256")
    .update(`${token}:${integratorWebhookSecret() || "dev-channel-link"}`)
    .digest("hex");
}

export type ChannelLinkStartResult =
  | { ok: true; url: string; expiresAtIso: string }
  | { ok: false; code: "unsupported_channel" | "server_error" };

/** Старт привязки: создаёт одноразовый токен и URL deep-link для Telegram. */
export async function startChannelLink(params: {
  userId: string;
  channelCode: "telegram" | "max" | "vk";
  botUsername: string;
}): Promise<ChannelLinkStartResult> {
  if (params.channelCode !== "telegram") {
    return { ok: false, code: "unsupported_channel" };
  }

  const plain = randomBytes(24).toString("base64url");
  const startPayload = `link_${plain}`;
  const expiresAt = new Date(Date.now() + SECRET_TTL_MIN * 60 * 1000);

  if (!env.DATABASE_URL) {
    const url = `https://t.me/${params.botUsername}?start=${encodeURIComponent(startPayload)}`;
    return { ok: true, url, expiresAtIso: expiresAt.toISOString() };
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
    const url = `https://t.me/${params.botUsername}?start=${encodeURIComponent(startPayload)}`;
    return { ok: true, url, expiresAtIso: expiresAt.toISOString() };
  } catch {
    return { ok: false, code: "server_error" };
  }
}

/** Завершение привязки из integrator (M2M): проверка токена и запись user_channel_bindings. */
export async function completeChannelLinkFromIntegrator(params: {
  linkToken: string;
  channelCode: "telegram";
  externalId: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
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
    return { ok: true };
  }
  if (new Date(r.expires_at).getTime() < Date.now()) {
    return { ok: false, code: "unknown_or_expired" };
  }

  await pool.query(
    `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (channel_code, external_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [r.user_id, params.channelCode, params.externalId]
  );
  await pool.query("UPDATE channel_link_secrets SET used_at = now() WHERE id = $1", [r.id]);

  return { ok: true };
}
