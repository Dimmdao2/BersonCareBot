import { getPool } from "@/infra/db/client";
import type { ChannelBindings, SessionUser } from "@/shared/types/session";
import type { IdentityResolutionPort } from "@/modules/auth/identityResolutionPort";

function rowToBindings(rows: { channel_code: string; external_id: string }[]): ChannelBindings {
  const bindings: ChannelBindings = {};
  for (const row of rows) {
    const key = row.channel_code === "telegram" ? "telegramId" : row.channel_code === "max" ? "maxId" : "vkId";
    (bindings as Record<string, string>)[key] = row.external_id;
  }
  return bindings;
}

export const pgIdentityResolutionPort: IdentityResolutionPort = {
  async findOrCreateByChannelBinding(params): Promise<SessionUser> {
    const pool = getPool();
    const existing = await pool.query(
      "SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2",
      [params.channelCode, params.externalId]
    );

    let userId: string;

    if (existing.rows.length > 0) {
      userId = existing.rows[0].user_id;
    } else {
      const insertUser = await pool.query(
        `INSERT INTO platform_users (display_name, role) VALUES ($1, $2) RETURNING id`,
        [params.displayName ?? params.externalId, params.role ?? "client"]
      );
      userId = insertUser.rows[0].id;
      await pool.query(
        "INSERT INTO user_channel_bindings (user_id, channel_code, external_id) VALUES ($1, $2, $3)",
        [userId, params.channelCode, params.externalId]
      );
    }

    const userRow = await pool.query(
      "SELECT display_name, role, phone_normalized FROM platform_users WHERE id = $1",
      [userId]
    );
    const u = userRow.rows[0];
    const bindingsRows = await pool.query(
      "SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1",
      [userId]
    );
    const bindings = rowToBindings(
      bindingsRows.rows as { channel_code: string; external_id: string }[]
    );

    return {
      userId,
      role: (u?.role as SessionUser["role"]) ?? "client",
      displayName: u?.display_name ?? params.displayName ?? params.externalId,
      phone: u?.phone_normalized,
      bindings,
    };
  },

  async findByChannelBinding(params): Promise<SessionUser | null> {
    const pool = getPool();
    const existing = await pool.query(
      "SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2",
      [params.channelCode, params.externalId]
    );
    if (existing.rows.length === 0) return null;
    const userId = existing.rows[0].user_id as string;
    const userRow = await pool.query(
      "SELECT display_name, role, phone_normalized FROM platform_users WHERE id = $1",
      [userId]
    );
    const u = userRow.rows[0];
    if (!u) return null;
    const bindingsRows = await pool.query(
      "SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1",
      [userId]
    );
    const bindings = rowToBindings(
      bindingsRows.rows as { channel_code: string; external_id: string }[]
    );
    return {
      userId,
      role: (u.role as SessionUser["role"]) ?? "client",
      displayName: u.display_name ?? params.externalId,
      phone: u.phone_normalized,
      bindings,
    };
  },
};
