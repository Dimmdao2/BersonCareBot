import type { Pool } from "pg";
import { runPgPoolPgText } from "@/infra/db/runWebappSql";
import type { ReminderRuleForTopicCode } from "@/modules/reminders/reminderOccurrenceTopicCode";
import type { ChannelBindings } from "@/shared/types/session";

export async function loadReminderRuleForMessengerTopicDisable(
  pool: Pool,
  params: {
    platformUserId: string;
    integratorOccurrenceId: string;
  },
): Promise<ReminderRuleForTopicCode | null> {
  const own = await runPgPoolPgText<{
    category: string;
    notification_topic_code: string | null;
    reminder_intent: string | null;
    linked_object_type: string | null;
  }>(
    pool,
    `SELECT rr.category::text AS category,
            rr.notification_topic_code,
            rr.reminder_intent,
            rr.linked_object_type::text AS linked_object_type
       FROM reminder_occurrence_history roh
 INNER JOIN platform_users pu ON pu.integrator_user_id = roh.integrator_user_id
 INNER JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
      WHERE roh.integrator_occurrence_id = $1
        AND pu.id = $2::uuid`,
    [params.integratorOccurrenceId, params.platformUserId],
  );
  const row = own.rows[0];
  if (!row) return null;
  return {
    category: row.category,
    notificationTopicCode: row.notification_topic_code,
    reminderIntent: row.reminder_intent,
    linkedObjectType: row.linked_object_type,
  };
}

export async function loadReminderMessengerChannelBindings(
  pool: Pool,
  platformUserId: string,
): Promise<ChannelBindings> {
  const result = await runPgPoolPgText<{ channel_code: string; external_id: string }>(
    pool,
    `SELECT channel_code, external_id
       FROM user_channel_bindings
      WHERE user_id = $1::uuid
        AND channel_code IN ('telegram', 'max')`,
    [platformUserId],
  );
  const bindings: ChannelBindings = {};
  for (const row of result.rows) {
    const channelCode = row.channel_code.trim();
    const externalId = row.external_id.trim();
    if (!externalId) continue;
    if (channelCode === "telegram") bindings.telegramId = externalId;
    if (channelCode === "max") bindings.maxId = externalId;
  }
  return bindings;
}
