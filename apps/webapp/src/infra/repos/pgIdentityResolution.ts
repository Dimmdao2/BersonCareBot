import { getPool } from "@/infra/db/client";
import type { ChannelBindings, SessionUser } from "@/shared/types/session";
import type { IdentityResolutionPort } from "@/modules/auth/identityResolutionPort";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";

function rowToBindings(rows: { channel_code: string; external_id: string }[]): ChannelBindings {
  const bindings: ChannelBindings = {};
  for (const row of rows) {
    const key = row.channel_code === "telegram" ? "telegramId" : row.channel_code === "max" ? "maxId" : "vkId";
    (bindings as Record<string, string>)[key] = row.external_id;
  }
  return bindings;
}

async function loadSessionUserForId(userId: string, externalIdForDisplay: string): Promise<SessionUser> {
  const pool = getPool();
  const canonicalId = (await resolveCanonicalUserId(pool, userId)) ?? userId;
  const userRow = await pool.query(
    "SELECT display_name, role, phone_normalized FROM platform_users WHERE id = $1",
    [canonicalId],
  );
  const u = userRow.rows[0];
  const bindingsRows = await pool.query(
    "SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1",
    [canonicalId],
  );
  const bindings = rowToBindings(bindingsRows.rows as { channel_code: string; external_id: string }[]);
  return {
    userId: canonicalId,
    role: (u?.role as SessionUser["role"]) ?? "client",
    displayName: u?.display_name ?? externalIdForDisplay,
    phone: u?.phone_normalized,
    bindings,
  };
}

export const pgIdentityResolutionPort: IdentityResolutionPort = {
  async findOrCreateByChannelBinding(params): Promise<SessionUser> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ user_id: string }>(
        "SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE",
        [params.channelCode, params.externalId],
      );

      let userId: string;

      if (existing.rows.length > 0) {
        userId = existing.rows[0].user_id;
      } else {
        const insertUser = await client.query<{ id: string }>(
          `INSERT INTO platform_users (display_name, role) VALUES ($1, $2) RETURNING id`,
          [params.displayName ?? params.externalId, params.role ?? "client"],
        );
        userId = insertUser.rows[0]!.id;
        const insBinding = await client.query<{ user_id: string }>(
          `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (channel_code, external_id) DO NOTHING
           RETURNING user_id`,
          [userId, params.channelCode, params.externalId],
        );
        if (insBinding.rows.length === 0) {
          const reread = await client.query<{ user_id: string }>(
            "SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE",
            [params.channelCode, params.externalId],
          );
          const ownerId = reread.rows[0]?.user_id;
          if (!ownerId) {
            throw new Error("findOrCreateByChannelBinding: binding missing after conflict");
          }
          await client.query("DELETE FROM platform_users WHERE id = $1", [userId]);
          userId = ownerId;
        }
      }
      await client.query("COMMIT");
      return loadSessionUserForId(userId, params.externalId);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },

  async findByChannelBinding(params): Promise<SessionUser | null> {
    const pool = getPool();
    const existing = await pool.query(
      "SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2",
      [params.channelCode, params.externalId],
    );
    if (existing.rows.length === 0) return null;
    const userId = existing.rows[0].user_id as string;
    return loadSessionUserForId(userId, params.externalId);
  },
};
