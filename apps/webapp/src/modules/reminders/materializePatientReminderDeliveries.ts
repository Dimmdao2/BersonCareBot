import type {
  OutgoingIntent,
  PatientReminderReadyOutgoingDelivery,
} from '@/modules/messaging/outgoingDeliveryQueuePort';
import { buildReminderDeepLink } from './buildReminderDeepLink';
import { reminderOccurrenceTopicCode } from './reminderOccurrenceTopicCode';

export type PatientReminderMaterializationRule = {
  id: string;
  organizationId: string;
  platformUserId: string;
  integratorUserId: string | null;
  category: string;
  linkedObjectType: string | null;
  linkedObjectId: string | null;
  customTitle: string | null;
  customText: string | null;
  displayTitle: string | null;
  reminderIntent: string | null;
  notificationTopicCode: string | null;
};

export type PatientReminderMaterializationOccurrence = {
  id: string;
  deliveryGeneration: number;
  plannedAt: string;
};

export type PatientReminderMaterializationTargets = {
  selectedChannels: readonly ('telegram' | 'max' | 'email' | 'web_push')[];
  telegramId?: string;
  maxId?: string;
  emailRecipient?: string;
};

const DEFAULT_TITLES: Readonly<Record<string, string>> = {
  exercise: 'Время упражнений 🏃',
  warmup: 'Разминка ⚡',
  breathing: 'Время подышать 🌬',
  water: 'Напоминание попить воду 💧',
  supplements_medication: 'Напоминание: бады и лекарства 💊',
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function primaryLabel(intent: string | null): string {
  return intent === 'warmup' ? 'Начать разминку' : 'Начать тренировку';
}

function callbackWithinLimit(value: string): boolean {
  return Buffer.byteLength(value, 'utf8') <= 64;
}

function reminderKeyboard(input: {
  occurrenceId: string;
  openUrl: string;
  scheduleUrl: string;
  intent: string | null;
}) {
  const snooze = `rem_snooze_menu:${input.occurrenceId}`;
  const skip = `rem_skip:${input.occurrenceId}`;
  const settings = `rem_notif_settings:${input.occurrenceId}`;
  const actionRow = [
    ...(callbackWithinLimit(snooze) ? [{ text: 'Напомнить позже', callback_data: snooze }] : []),
    ...(callbackWithinLimit(skip) ? [{ text: 'Пропущу', callback_data: skip }] : []),
  ];
  return {
    inline_keyboard: [
      [{ text: primaryLabel(input.intent), url: input.openUrl }],
      ...(actionRow.length > 0 ? [actionRow] : []),
      [
        { text: 'Расписание', url: input.scheduleUrl },
        ...(callbackWithinLimit(settings)
          ? [{ text: 'Настройки уведомлений', callback_data: settings }]
          : []),
      ],
    ],
  };
}

function eventId(
  occurrence: PatientReminderMaterializationOccurrence,
  channel: PatientReminderReadyOutgoingDelivery['channel'],
): string {
  return `rem:${occurrence.id}:g${occurrence.deliveryGeneration}:${channel}`;
}

function intent(input: {
  eventId: string;
  channel: PatientReminderReadyOutgoingDelivery['channel'];
  integratorUserId: string | null;
  payload: Record<string, unknown>;
}): OutgoingIntent {
  return {
    type: 'message.send',
    meta: {
      eventId: input.eventId,
      occurredAt: new Date().toISOString(),
      source: input.channel,
      outboundMessageClass: 'routine_product',
      outboundCapability: input.channel === 'web_push' ? 'app_push' : 'essential_delivery',
      ...(input.integratorUserId ? { userId: input.integratorUserId } : {}),
    },
    payload: input.payload,
  };
}

/** Webapp-owned business materializer. The worker receives only ready provider intents. */
export function materializePatientReminderDeliveries(input: {
  rule: PatientReminderMaterializationRule;
  occurrence: PatientReminderMaterializationOccurrence;
  targets: PatientReminderMaterializationTargets;
  appBaseUrl: string;
  linkedTitle?: string | null;
}): PatientReminderReadyOutgoingDelivery[] {
  const { rule, occurrence, targets } = input;
  const topicCode = reminderOccurrenceTopicCode(rule, rule.category);
  if (!topicCode) return [];
  const title = (
    rule.customTitle?.trim() ||
    input.linkedTitle?.trim() ||
    rule.displayTitle?.trim() ||
    DEFAULT_TITLES[rule.category] ||
    'Напоминание'
  ).slice(0, 200);
  const customText = rule.customText?.trim().slice(0, 8000) || '';
  const body = customText || title;
  const openUrl = buildReminderDeepLink({
    appBaseUrl: input.appBaseUrl,
    linkedObjectType: rule.linkedObjectType,
    linkedObjectId: rule.linkedObjectId,
    reminderIntent: rule.reminderIntent,
    organizationId: rule.organizationId,
  });
  const scheduleUrl = `${input.appBaseUrl.replace(/\/$/, '')}/app/patient/reminders?from=reminder`;
  const keyboard = reminderKeyboard({
    occurrenceId: occurrence.id,
    openUrl,
    scheduleUrl,
    intent: rule.reminderIntent,
  });
  const deliveries: PatientReminderReadyOutgoingDelivery[] = [];

  const append = (
    channel: PatientReminderReadyOutgoingDelivery['channel'],
    externalId: string,
    payload: Record<string, unknown>,
  ) => {
    const id = eventId(occurrence, channel);
    deliveries.push({
      organizationId: rule.organizationId,
      eventId: id,
      kind: 'reminder_dispatch',
      channel,
      maxAttempts: 6,
      nextRetryAt: occurrence.plannedAt,
      occurrenceId: occurrence.id,
      deliveryGeneration: occurrence.deliveryGeneration,
      topicCode,
      externalId,
      logText: (channel === 'email' ? `${body}\n\n${openUrl}` : body).slice(0, 16000),
      platformUserId: rule.platformUserId,
      intent: intent({
        eventId: id,
        channel,
        integratorUserId: rule.integratorUserId,
        payload,
      }),
    });
  };

  for (const channel of targets.selectedChannels) {
    if (channel === 'telegram' && targets.telegramId?.trim()) {
      append(channel, targets.telegramId.trim(), {
        recipient: { chatId: targets.telegramId.trim() },
        message: {
          text: `<b>${escapeHtml(title)}</b>${customText ? `\n\n${escapeHtml(customText)}` : ''}`,
        },
        replyMarkup: keyboard,
        parse_mode: 'HTML',
        delivery: { channels: [channel], maxAttempts: 1 },
      });
    } else if (channel === 'max' && targets.maxId?.trim()) {
      append(channel, targets.maxId.trim(), {
        recipient: { userId: targets.maxId.trim() },
        message: {
          text: `<b>${escapeHtml(title)}</b>${customText ? `\n\n${escapeHtml(customText)}` : ''}`,
        },
        replyMarkup: keyboard,
        parse_mode: 'HTML',
        delivery: { channels: [channel], maxAttempts: 1 },
      });
    } else if (channel === 'email' && targets.emailRecipient?.trim()) {
      const emailText = `${body}\n\n${openUrl}`.slice(0, 8000);
      append(channel, targets.emailRecipient.trim(), {
        recipient: { email: targets.emailRecipient.trim() },
        message: { text: emailText },
        subject: title.slice(0, 200),
        url: openUrl,
        delivery: { channels: [channel], maxAttempts: 1 },
      });
    } else if (channel === 'web_push') {
      append(channel, rule.platformUserId, {
        recipient: { pushUserId: rule.platformUserId },
        message: { text: body },
        title,
        url: openUrl,
        pushExtras: {
          tag: `reminder:${occurrence.id}:g${occurrence.deliveryGeneration}`,
          topicCode,
          intentType: 'patient_reminder',
          occurrenceId: occurrence.id,
        },
        delivery: { channels: [channel], maxAttempts: 1 },
      });
    }
  }
  return deliveries;
}
