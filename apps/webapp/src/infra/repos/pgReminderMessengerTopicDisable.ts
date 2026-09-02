import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { runPgPoolSql } from '@/infra/db/runWebappSql';
import type { ReminderRuleForTopicCode } from '@/modules/reminders/reminderOccurrenceTopicCode';
import type { ChannelBindings } from '@/shared/types/session';

/**
 * Track D (#987): ownership is `reminder_occurrence_history.platform_user_id` (NOT NULL), read
 * directly. It used to hop through the retired public identity on both sides, which silently
 * excluded every occurrence whose owner has no retired numeric identity — i.e. exactly the
 * canonical-only patients this cutover is for, on the messenger "disable this topic" callback.
 */
export async function loadReminderRuleForMessengerTopicDisable(
  pool: Pool,
  params: {
    platformUserId: string;
    integratorOccurrenceId: string;
  },
): Promise<ReminderRuleForTopicCode | null> {
  const own = await runPgPoolSql<{
    category: string;
    notification_topic_code: string | null;
    reminder_intent: string | null;
    linked_object_type: string | null;
  }>(
    pool,
    sql`SELECT rr.category::text AS category,
            rr.notification_topic_code,
            rr.reminder_intent,
            rr.linked_object_type::text AS linked_object_type
       FROM reminder_occurrence_history roh
 INNER JOIN reminder_rules rr ON rr.integrator_rule_id = roh.integrator_rule_id
      WHERE roh.integrator_occurrence_id = ${params.integratorOccurrenceId}
        AND roh.platform_user_id = ${params.platformUserId}::uuid`,
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
  const result = await runPgPoolSql<{ channel_code: string; external_id: string }>(
    pool,
    sql`SELECT channel_code, external_id
       FROM user_channel_bindings
      WHERE user_id = ${platformUserId}::uuid
        AND channel_code IN ('telegram', 'max')`,
  );
  const bindings: ChannelBindings = {};
  for (const row of result.rows) {
    const channelCode = row.channel_code.trim();
    const externalId = row.external_id.trim();
    if (!externalId) continue;
    if (channelCode === 'telegram') bindings.telegramId = externalId;
    if (channelCode === 'max') bindings.maxId = externalId;
  }
  return bindings;
}
