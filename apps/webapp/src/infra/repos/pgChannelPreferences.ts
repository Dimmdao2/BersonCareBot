import { getPool } from "@/infra/db/client";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { ChannelCode, ChannelPreference } from "@/modules/channel-preferences/types";

const CODES: ChannelCode[] = ["telegram", "max", "vk", "sms", "email"];

const AUTH_CHANNELS = new Set<ChannelCode>(["telegram", "max", "email", "sms"]);

function userMatchSql(paramIndex: number): string {
  return `(platform_user_id = $${paramIndex}::uuid OR (platform_user_id IS NULL AND user_id = $${paramIndex}::text))`;
}

function rowToPreference(row: {
  channel_code: string;
  is_enabled_for_messages: boolean;
  is_enabled_for_notifications: boolean;
  is_preferred_for_auth?: boolean;
}): ChannelPreference {
  return {
    channelCode: row.channel_code as ChannelCode,
    isEnabledForMessages: row.is_enabled_for_messages,
    isEnabledForNotifications: row.is_enabled_for_notifications,
    isPreferredForAuth: Boolean(row.is_preferred_for_auth),
  };
}

export const pgChannelPreferencesPort: ChannelPreferencesPort = {
  async getPreferences(userId) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT channel_code, is_enabled_for_messages, is_enabled_for_notifications, is_preferred_for_auth
       FROM user_channel_preferences WHERE ${userMatchSql(1)}`,
      [userId]
    );
    const byCode = new Map<string, ChannelPreference>();
    for (const row of result.rows) {
      byCode.set(row.channel_code, rowToPreference(row));
    }
    return CODES.map((code) =>
      byCode.get(code) ?? {
        channelCode: code,
        isEnabledForMessages: true,
        isEnabledForNotifications: true,
        isPreferredForAuth: false,
      }
    );
  },

  async upsertPreference(params) {
    const pool = getPool();
    const now = new Date();
    await pool.query(
      `INSERT INTO user_channel_preferences (
         user_id, platform_user_id, channel_code, is_enabled_for_messages, is_enabled_for_notifications, updated_at
       )
       VALUES ($1::text, $1::uuid, $2, $3, $4, $5)
       ON CONFLICT (user_id, channel_code) DO UPDATE SET
         platform_user_id = COALESCE(user_channel_preferences.platform_user_id, EXCLUDED.platform_user_id),
         is_enabled_for_messages = EXCLUDED.is_enabled_for_messages,
         is_enabled_for_notifications = EXCLUDED.is_enabled_for_notifications,
         updated_at = EXCLUDED.updated_at`,
      [params.userId, params.channelCode, params.isEnabledForMessages, params.isEnabledForNotifications, now]
    );
    const result = await pool.query(
      `SELECT channel_code, is_enabled_for_messages, is_enabled_for_notifications, is_preferred_for_auth
       FROM user_channel_preferences WHERE ${userMatchSql(1)} AND channel_code = $2`,
      [params.userId, params.channelCode]
    );
    return rowToPreference(result.rows[0]);
  },

  async getPreferredAuthChannelCode(userId) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT channel_code FROM user_channel_preferences
       WHERE ${userMatchSql(1)} AND is_preferred_for_auth = true
       LIMIT 1`,
      [userId]
    );
    const code = result.rows[0]?.channel_code as ChannelCode | undefined;
    return code ?? null;
  },

  async setPreferredAuthChannel(userId, channelCode) {
    const pool = getPool();
    const now = new Date();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE user_channel_preferences SET is_preferred_for_auth = false WHERE ${userMatchSql(1)}`,
        [userId]
      );
      if (channelCode == null) {
        await client.query("COMMIT");
        return;
      }
      if (!AUTH_CHANNELS.has(channelCode)) {
        await client.query("COMMIT");
        return;
      }
      await client.query(
        `INSERT INTO user_channel_preferences (
           user_id, platform_user_id, channel_code, is_enabled_for_messages, is_enabled_for_notifications, is_preferred_for_auth, updated_at
         )
         VALUES ($1::text, $1::uuid, $2, true, true, true, $3)
         ON CONFLICT (user_id, channel_code) DO UPDATE SET
           platform_user_id = COALESCE(user_channel_preferences.platform_user_id, EXCLUDED.platform_user_id),
           is_preferred_for_auth = true,
           updated_at = EXCLUDED.updated_at`,
        [userId, channelCode, now]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};
