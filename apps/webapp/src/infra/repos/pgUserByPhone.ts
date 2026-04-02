import { getPool } from "@/infra/db/client";
import type { ChannelBindings, SessionUser } from "@/shared/types/session";
import type { ChannelContext } from "@/modules/auth/channelContext";
import type { UserByPhonePort } from "@/modules/auth/userByPhonePort";
import { channelToBindingKey } from "@/modules/auth/channelContext";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

function rowToBindings(rows: { channel_code: string; external_id: string }[]): ChannelBindings {
  const bindings: ChannelBindings = {};
  for (const row of rows) {
    const key = row.channel_code === "telegram" ? "telegramId" : row.channel_code === "max" ? "maxId" : "vkId";
    (bindings as Record<string, string>)[key] = row.external_id;
  }
  return bindings;
}

export const pgUserByPhonePort: UserByPhonePort = {
  async getPhoneByUserId(userId: string): Promise<string | null> {
    const pool = getPool();
    const res = await pool.query<{ phone_normalized: string | null }>(
      "SELECT phone_normalized FROM platform_users WHERE id = $1",
      [userId]
    );
    const p = res.rows[0]?.phone_normalized;
    return typeof p === "string" && p.trim() ? p : null;
  },

  async getVerifiedEmailForUser(userId: string): Promise<string | null> {
    const pool = getPool();
    const res = await pool.query<{ email: string | null }>(
      "SELECT email FROM platform_users WHERE id = $1 AND email_verified_at IS NOT NULL",
      [userId]
    );
    const e = res.rows[0]?.email;
    return typeof e === "string" && e.trim() ? e.trim() : null;
  },

  async findByUserId(userId: string): Promise<SessionUser | null> {
    const pool = getPool();
    const userRow = await pool.query(
      "SELECT id, display_name, role, phone_normalized FROM platform_users WHERE id = $1",
      [userId]
    );
    if (userRow.rows.length === 0) return null;
    const u = userRow.rows[0];
    const bindingsRows = await pool.query(
      "SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1",
      [u.id]
    );
    const bindings = rowToBindings(
      bindingsRows.rows as { channel_code: string; external_id: string }[]
    );
    return {
      userId: u.id,
      role: u.role as SessionUser["role"],
      displayName: u.display_name ?? "",
      phone: u.phone_normalized,
      bindings,
    };
  },

  async findByPhone(normalizedPhone: string): Promise<SessionUser | null> {
    const pool = getPool();
    const userRow = await pool.query(
      `SELECT id, display_name, role, phone_normalized FROM platform_users
       WHERE phone_normalized = $1
       ORDER BY id ASC
       LIMIT 2`,
      [normalizedPhone]
    );
    if (userRow.rows.length === 0) return null;
    if (userRow.rows.length > 1) return null;
    const u = userRow.rows[0];
    const bindingsRows = await pool.query(
      "SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1",
      [u.id]
    );
    const bindings = rowToBindings(
      bindingsRows.rows as { channel_code: string; external_id: string }[]
    );
    return {
      userId: u.id,
      role: u.role as SessionUser["role"],
      displayName: u.display_name ?? "",
      phone: u.phone_normalized,
      bindings,
    };
  },

  async createOrBind(phone: string, context: ChannelContext): Promise<SessionUser> {
    const normalized = normalizeRuPhoneE164(phone);
    const pool = getPool();
    const key = channelToBindingKey(context.channel);
    const channelCode = context.channel;

    const existing = await pool.query(
      "SELECT id, display_name, role FROM platform_users WHERE phone_normalized = $1",
      [normalized]
    );

    let userId: string;
    let role: SessionUser["role"];
    let displayName: string;

    if (existing.rows.length > 0) {
      const u = existing.rows[0];
      userId = u.id;
      role = u.role;
      displayName = context.displayName ?? u.display_name ?? normalized;
      await pool.query(
        "UPDATE platform_users SET display_name = $1, updated_at = now() WHERE id = $2",
        [displayName, userId]
      );
      if (key) {
        await pool.query(
          `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (channel_code, external_id) DO UPDATE SET user_id = $1`,
          [userId, channelCode, context.chatId]
        );
      }
    } else {
      const insert = await pool.query(
        `INSERT INTO platform_users (phone_normalized, display_name, role)
         VALUES ($1, $2, 'client') RETURNING id`,
        [normalized, context.displayName ?? normalized]
      );
      userId = insert.rows[0].id;
      role = "client";
      displayName = context.displayName ?? normalized;
      if (key) {
        await pool.query(
          "INSERT INTO user_channel_bindings (user_id, channel_code, external_id) VALUES ($1, $2, $3)",
          [userId, channelCode, context.chatId]
        );
      }
    }

    const bindingsRows = await pool.query(
      "SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1",
      [userId]
    );
    const bindings = rowToBindings(
      bindingsRows.rows as { channel_code: string; external_id: string }[]
    );

    return {
      userId,
      role,
      displayName,
      phone: normalized,
      bindings,
    };
  },
};
