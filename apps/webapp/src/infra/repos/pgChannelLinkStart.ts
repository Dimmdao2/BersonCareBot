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
