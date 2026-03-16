import { getPool } from "@/infra/db/client";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { ChannelCode, ChannelPreference } from "@/modules/channel-preferences/types";

const CODES: ChannelCode[] = ["telegram", "max", "vk"];

function rowToPreference(row: {
  channel_code: string;
  is_enabled_for_messages: boolean;
  is_enabled_for_notifications: boolean;
}): ChannelPreference {
  return {
    channelCode: row.channel_code as ChannelCode,
    isEnabledForMessages: row.is_enabled_for_messages,
    isEnabledForNotifications: row.is_enabled_for_notifications,
  };
}

export const pgChannelPreferencesPort: ChannelPreferencesPort = {
  async getPreferences(userId) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT channel_code, is_enabled_for_messages, is_enabled_for_notifications
       FROM user_channel_preferences WHERE user_id = $1`,
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
      }
    );
  },

  async upsertPreference(params) {
    const pool = getPool();
    const now = new Date();
    await pool.query(
      `INSERT INTO user_channel_preferences (user_id, channel_code, is_enabled_for_messages, is_enabled_for_notifications, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, channel_code) DO UPDATE SET
         is_enabled_for_messages = EXCLUDED.is_enabled_for_messages,
         is_enabled_for_notifications = EXCLUDED.is_enabled_for_notifications,
         updated_at = EXCLUDED.updated_at`,
      [params.userId, params.channelCode, params.isEnabledForMessages, params.isEnabledForNotifications, now]
    );
    const result = await pool.query(
      `SELECT channel_code, is_enabled_for_messages, is_enabled_for_notifications
       FROM user_channel_preferences WHERE user_id = $1 AND channel_code = $2`,
      [params.userId, params.channelCode]
    );
    return rowToPreference(result.rows[0]);
  },
};
