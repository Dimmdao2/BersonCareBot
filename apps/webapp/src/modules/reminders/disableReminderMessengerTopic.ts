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

export type DisableReminderMessengerDeps = {
  loadOccurrenceRule: (params: {
    platformUserId: string;
    integratorOccurrenceId: string;
  }) => Promise<ReminderRuleForTopicCode | null>;
  loadChannelBindings: (platformUserId: string) => Promise<ChannelBindings>;
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
  const rule = await deps.loadOccurrenceRule({
    platformUserId: params.platformUserId,
    integratorOccurrenceId: params.integratorOccurrenceId,
  });
  if (!rule) {
    return { ok: false, error: "not_found" };
  }
  const topicCode = reminderOccurrenceTopicCode(rule, rule.category);
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

  const bindings = await deps.loadChannelBindings(params.platformUserId);
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
