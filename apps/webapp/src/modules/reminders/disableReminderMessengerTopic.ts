import type { Pool } from "pg";
import type { ChannelBindings } from "@/shared/types/session";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { PatientTopicChannelCode } from "@/modules/patient-notifications/topicChannelRules";
import {
  allowedChannelsForTopic,
} from "@/modules/patient-notifications/topicChannelRules";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { reminderOccurrenceTopicCode, type ReminderRuleForTopicCode } from "./reminderOccurrenceTopicCode";

const MESSENGER_LABEL_RU: Record<"telegram" | "max", string> = {
  telegram: "Telegram",
  max: "MAX",
};

const CHANNEL_LABEL_TOPIC_RU: Record<PatientTopicChannelCode, string> = {
  web_push: "Push",
  telegram: "Telegram",
  max: "MAX",
  email: "Email",
};

function formatListRu(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} и ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}`;
}

async function loadBindings(pool: Pool, platformUserId: string): Promise<ChannelBindings> {
  const r = await pool.query<{ channel_code: string; external_id: string }>(
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

function topicChannelEnabled(
  rows: Awaited<ReturnType<TopicChannelPrefsPort["listByUserId"]>>,
  topicCode: string,
  channelCode: PatientTopicChannelCode,
): boolean {
  const row = rows.find((x) => x.topicCode === topicCode && x.channelCode === channelCode);
  return row ? row.isEnabled : true;
}

async function activeReminderDeliveryLabelsForTopic(input: {
  platformUserId: string;
  topicCode: string;
  bindings: ChannelBindings;
  channelPreferences: ChannelPreferencesPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  webPushSubscriptions: Pick<WebPushSubscriptionsPort, "hasAnyForUserId">;
}): Promise<string[]> {
  const prefs = await input.channelPreferences.getPreferences(input.platformUserId);
  const byCode = new Map(prefs.map((p) => [p.channelCode, p]));
  const topicRows = await input.topicChannelPrefs.listByUserId(input.platformUserId);
  const allowed = new Set(
    allowedChannelsForTopic(input.topicCode) as readonly PatientTopicChannelCode[],
  );
  const ordered: PatientTopicChannelCode[] = [];
  const pushLike: PatientTopicChannelCode[] = ["web_push", "telegram", "max", "email"];
  for (const code of pushLike) {
    if (allowed.has(code)) ordered.push(code);
  }

  const active: string[] = [];
  for (const channelCode of ordered) {
    if (!topicChannelEnabled(topicRows, input.topicCode, channelCode)) continue;
    switch (channelCode) {
      case "web_push":
        if (byCode.get("web_push")?.isEnabledForNotifications === false) break;
        if (await input.webPushSubscriptions.hasAnyForUserId(input.platformUserId)) {
          active.push(CHANNEL_LABEL_TOPIC_RU.web_push);
        }
        break;
      case "telegram":
        if (byCode.get("telegram")?.isEnabledForNotifications === false) break;
        if (input.bindings.telegramId) active.push(CHANNEL_LABEL_TOPIC_RU.telegram);
        break;
      case "max":
        if (byCode.get("max")?.isEnabledForNotifications === false) break;
        if (input.bindings.maxId) active.push(CHANNEL_LABEL_TOPIC_RU.max);
        break;
      case "email":
        if (byCode.get("email")?.isEnabledForNotifications === false) break;
        active.push(CHANNEL_LABEL_TOPIC_RU.email);
        break;
      default:
        break;
    }
  }
  return active;
}

export type DisableReminderMessengerDeps = {
  pool: Pool;
  channelPreferences: ChannelPreferencesPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  webPushSubscriptions: Pick<WebPushSubscriptionsPort, "hasAnyForUserId">;
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
  const own = await pool.query<{
    category: string;
    notification_topic_code: string | null;
    reminder_intent: string | null;
    linked_object_type: string | null;
  }>(
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
  const activeLabels = await activeReminderDeliveryLabelsForTopic({
    platformUserId: params.platformUserId,
    topicCode,
    bindings,
    channelPreferences: deps.channelPreferences,
    topicChannelPrefs: deps.topicChannelPrefs,
    webPushSubscriptions: deps.webPushSubscriptions,
  });

  const listCsv = formatListRu(activeLabels);
  const paragraphs: string[] = [
    `Хорошо, отключаю напоминания в боте (${label}).`,
    ...(listCsv ?
      [`Сейчас остаются активными напоминания в ${listCsv}.`]
    : ["Сейчас не осталось активных каналов для напоминаний."]),
    `Очень рекомендую поставить мобильное приложение — там все удобнее и работают push уведомления.`,
  ];

  return { ok: true, persisted: true, paragraphs };
}
