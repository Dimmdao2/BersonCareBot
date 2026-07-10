import type { Pool } from "pg";
import { runPgPoolPgText, runWebappPgText } from "@/infra/db/runWebappSql";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";

export async function replaceChannelLinkSecret(params: {
  userId: string;
  channelCode: "telegram" | "max";
  tokenHash: string;
  expiresAtIso: string;
}): Promise<void> {
  await runWebappPgText("DELETE FROM channel_link_secrets WHERE user_id = $1 AND channel_code = $2", [
    params.userId,
    params.channelCode,
  ]);
  await runWebappPgText(
    `INSERT INTO channel_link_secrets (user_id, channel_code, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [params.userId, params.channelCode, params.tokenHash, params.expiresAtIso],
  );
}

export async function loadPlatformPhoneBindingInfo(
  pool: Pool,
  userId: string,
): Promise<{ needsPhone: boolean; phoneNormalized?: string }> {
  const canonical = await resolveCanonicalUserId(pool, userId);
  const result = await runPgPoolPgText<{ phone_normalized: string | null }>(
    pool,
    `SELECT phone_normalized FROM platform_users WHERE id = $1::uuid`,
    [canonical],
  );
  const phone = result.rows[0]?.phone_normalized;
  const phoneNormalized = typeof phone === "string" && phone.trim().length > 0 ? phone.trim() : undefined;
  return { needsPhone: phoneNormalized === undefined, phoneNormalized };
}

export type ChannelLinkSecretRow = {
  id: string;
  userId: string;
  expiresAt: string;
  usedAt: string | null;
};

export async function loadChannelLinkSecretByTokenHash(params: {
  channelCode: "telegram" | "max";
  tokenHash: string;
}): Promise<ChannelLinkSecretRow | null> {
  const result = await runWebappPgText<{
    id: string;
    user_id: string;
    expires_at: string;
    used_at: string | null;
  }>(
    `SELECT id, user_id, expires_at, used_at FROM channel_link_secrets
     WHERE channel_code = $1 AND token_hash = $2`,
    [params.channelCode, params.tokenHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

export async function loadChannelBindingUserId(params: {
  channelCode: "telegram" | "max";
  externalId: string;
}): Promise<string | null> {
  const result = await runWebappPgText<{ user_id: string }>(
    `SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2`,
    [params.channelCode, params.externalId],
  );
  return result.rows[0]?.user_id ?? null;
}

export async function markChannelLinkSecretUsed(secretRowId: string): Promise<void> {
  await runWebappPgText("UPDATE channel_link_secrets SET used_at = now() WHERE id = $1", [secretRowId]);
}

export async function markChannelLinkSecretUsedIfUnused(secretRowId: string): Promise<void> {
  await runWebappPgText("UPDATE channel_link_secrets SET used_at = now() WHERE id = $1 AND used_at IS NULL", [
    secretRowId,
  ]);
}

export async function insertChannelBinding(params: {
  userId: string;
  channelCode: "telegram" | "max";
  externalId: string;
}): Promise<void> {
  await runWebappPgText(
    `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
     VALUES ($1, $2, $3)`,
    [params.userId, params.channelCode, params.externalId],
  );
}
