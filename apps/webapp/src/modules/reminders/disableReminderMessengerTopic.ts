import type { Pool } from "pg";
import { runPgPoolPgText } from "@/infra/db/runWebappSql";
import type { ChannelBindings } from "@/shared/types/session";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import {
  formatReminderDeliveryChannelsListRu,
  resolveActiveReminderDeliveryLabelsForTopic,
} from "./reminderDeliveryChannelLabels";
import { reminderOccurrenceTopicCode, type ReminderRuleForTopicCode } from "./reminderOccurrenceTopicCode";

const MESSENGER_LABEL_RU: Record<"telegram" | "max", string> = {
  telegram: "Telegram",
  max: "MAX",
};

async function loadBindings(pool: Pool, platformUserId: string): Promise<ChannelBindings> {
  const r = await runPgPoolPgText<{ channel_code: string; external_id: string }>(
    pool,
    `SELECT channel_code, external_id
       FROM user_channel_bindings
      WHERE user_id = $1::uuid
        AND channel_code IN ('telegram', 'max')`,
    [platformUserId],
  );
  const b: ChannelBindings = {};
  for (const row of r.rows) {
    const cc = row.channel_code.trim();
    const ext = row.external_id.trim();
    if (!ext) continue;
    if (cc === "telegram") b.telegramId = ext;
    if (cc === "max") b.maxId = ext;
  }
  return b;
}

export type DisableReminderMessengerDeps = {
  pool: Pool;
  channelPreferences: ChannelPreferencesPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  webPushSubscriptions: Pick<WebPushSubscriptionsPort, "hasAnyForUserId">;
  getProfileEmailFields: (
    platformUserId: string,
  ) => Promise<{ email: string | null; emailVerifiedAt: string | null }>;
};

/** Integrator-signed: disable messenger reminders for occurrence's mailing topic (`user_notification_topic_channels`). */
export async function disableReminderMessengerTopicForOccurrence(
  deps: DisableReminderMessengerDeps,
  params: {
    platformUserId: string;
    integratorOccurrenceId: string;
    messengerChannel: "telegram" | "max";
  },
): Promise<
  | { ok: false; error: "not_found" }
  | { ok: true; persisted: false; paragraphs: string[] }
  | { ok: true; persisted: true; paragraphs: string[] }
> {
  const { pool } = deps;
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
  if (own.rows.length === 0) {
    return { ok: false, error: "not_found" };
  }
  const dbRow = own.rows[0]!;
  const rule: ReminderRuleForTopicCode = {
    category: dbRow.category,
    notificationTopicCode: dbRow.notification_topic_code,
    reminderIntent: dbRow.reminder_intent,
    linkedObjectType: dbRow.linked_object_type,
  };
  const topicCode = reminderOccurrenceTopicCode(rule, dbRow.category);
  const label = MESSENGER_LABEL_RU[params.messengerChannel];

  if (!topicCode) {
    return {
      ok: true,
      persisted: false,
      paragraphs: [
        `Хорошо — для этого типа напоминаний канал (${label}) пока не настраивается через темы уведомлений.`,
        `Откройте «Настроить каналы уведомлений» ниже, если хотите управлять напоминаниями в приложении.`,
        `Очень рекомендую поставить мобильное приложение — там все удобнее и работают push уведомления.`,
      ],
    };
  }

  await deps.topicChannelPrefs.upsert(params.platformUserId, topicCode, params.messengerChannel, false);

  const bindings = await loadBindings(pool, params.platformUserId);
  const emailFields = await deps.getProfileEmailFields(params.platformUserId);
  const activeLabels = await resolveActiveReminderDeliveryLabelsForTopic({
    platformUserId: params.platformUserId,
    topicCode,
    bindings,
    channelPreferences: deps.channelPreferences,
    topicChannelPrefs: deps.topicChannelPrefs,
    webPushSubscriptions: deps.webPushSubscriptions,
    email: {
      hasEmail: Boolean(emailFields.email?.trim()),
      verified: Boolean(emailFields.emailVerifiedAt),
    },
  });

  const listCsv = formatReminderDeliveryChannelsListRu(activeLabels);
  const paragraphs: string[] = [
    `Хорошо, отключаю напоминания в боте (${label}).`,
    ...(listCsv ?
      [`Сейчас остаются активными напоминания в ${listCsv}.`]
    : ["Сейчас не осталось активных каналов для напоминаний."]),
    `Очень рекомендую поставить мобильное приложение — там все удобнее и работают push уведомления.`,
  ];

  return { ok: true, persisted: true, paragraphs };
}
