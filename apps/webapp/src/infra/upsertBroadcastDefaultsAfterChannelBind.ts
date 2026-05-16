/**
 * После успешной привязки мессенджера/SMS: явно включаем сообщения и уведомления для этого канала
 * (см. план каналов рассылок врача). Использовать тем же клиентом пула/транзакции, что и INSERT binding.
 */
import type { PoolClient } from "pg";

const LINK_CHANNELS = new Set(["telegram", "max", "sms"]);

type Queryable = Pick<PoolClient, "query">;

export async function upsertBroadcastDefaultsAfterChannelBind(
  executor: Queryable,
  userId: string,
  channelCode: string,
  now = new Date(),
): Promise<void> {
  if (!LINK_CHANNELS.has(channelCode)) return;

  await executor.query(
    `INSERT INTO user_channel_preferences (
       user_id, platform_user_id, channel_code, is_enabled_for_messages, is_enabled_for_notifications, updated_at
     )
     VALUES ($1::text, $1::uuid, $2, true, true, $3)
     ON CONFLICT (user_id, channel_code) DO UPDATE SET
       platform_user_id = COALESCE(user_channel_preferences.platform_user_id, EXCLUDED.platform_user_id),
       is_enabled_for_messages = true,
       is_enabled_for_notifications = true,
       updated_at = EXCLUDED.updated_at`,
    [userId, channelCode, now],
  );
}
