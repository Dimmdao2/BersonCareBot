import type {
  OutgoingIntent,
  SpecialistTaskReadyOutgoingDelivery,
} from '@/modules/messaging/outgoingDeliveryQueuePort';
import {
  resolveSpecialistTaskReminderChannelsForUser,
  type ResolveSpecialistTaskReminderChannelsDeps,
} from '@/modules/doctor-notifications/resolveSpecialistTaskReminderChannels';
import type { SpecialistTaskRow } from './types';

export type PrepareSpecialistTaskReminderDeliveriesDeps =
  ResolveSpecialistTaskReminderChannelsDeps & { appBaseUrl: string };

function specialistTasksUrl(appBaseUrl: string): string {
  const base = appBaseUrl.trim().replace(/\/+$/, '');
  if (!base) throw new Error('specialist_task_reminder_app_base_url_required');
  return `${base}/app/doctor#doctor-today-global-tasks`;
}

function reminderText(url: string): string {
  return `Напоминание: проверьте задачи в кабинете.\n${url}`;
}

type MaterializedIntent = {
  meta: Omit<OutgoingIntent['meta'], 'eventId' | 'occurredAt'>;
  payload: OutgoingIntent['payload'];
};

function eventId(
  task: SpecialistTaskRow,
  channel: SpecialistTaskReadyOutgoingDelivery['channel'],
): string {
  return `specialist-task:${task.id}:${encodeURIComponent(task.remindAt ?? '')}:${channel}`;
}

/** Webapp resolves all recipients, channels, text and absolute due time before durable enqueue. */
export async function prepareSpecialistTaskReminderDeliveries(
  task: SpecialistTaskRow,
  deps: PrepareSpecialistTaskReminderDeliveriesDeps,
): Promise<SpecialistTaskReadyOutgoingDelivery[]> {
  if (!task.organizationId || !task.remindAt || task.completedAt) return [];
  const organizationId = task.organizationId;
  const remindAt = task.remindAt;
  const [channels, bindings, email] = await Promise.all([
    resolveSpecialistTaskReminderChannelsForUser(task.ownerUserId, organizationId, deps),
    deps.getChannelBindings(task.ownerUserId),
    deps.getProfileEmail(task.ownerUserId),
  ]);
  const url = specialistTasksUrl(deps.appBaseUrl);
  const text = reminderText(url);
  const occurredAt = new Date().toISOString();
  const deliveries: SpecialistTaskReadyOutgoingDelivery[] = [];
  const appendDelivery = (
    channel: SpecialistTaskReadyOutgoingDelivery['channel'],
    materializedIntent: MaterializedIntent,
  ) => {
    const id = eventId(task, channel);
    deliveries.push({
      organizationId,
      eventId: id,
      kind: 'specialist_task_reminder',
      channel,
      successOutcome: {
        type: 'specialistTask.reminder.markSent',
        taskId: task.id,
      },
      nextRetryAt: remindAt,
      intent: {
        type: 'message.send',
        meta: { eventId: id, occurredAt, ...materializedIntent.meta },
        payload: materializedIntent.payload,
      },
    });
  };
  for (const channel of channels) {
    if (channel === 'telegram' && bindings.telegramId?.trim()) {
      appendDelivery(channel, {
        meta: {
          source: 'telegram',
          userId: task.ownerUserId,
          outboundMessageClass: 'routine_product',
          outboundCapability: 'essential_delivery',
        },
        payload: {
          recipient: { chatId: bindings.telegramId.trim() },
          message: { text },
          replyMarkup: { inline_keyboard: [[{ text: 'Открыть задачи', url }]] },
          delivery: { channels: ['telegram'] },
        },
      });
    } else if (channel === 'max' && bindings.maxId?.trim()) {
      appendDelivery(channel, {
        meta: {
          source: 'max',
          userId: task.ownerUserId,
          outboundMessageClass: 'routine_product',
          outboundCapability: 'essential_delivery',
        },
        payload: {
          recipient: { userId: bindings.maxId.trim() },
          message: { text },
          replyMarkup: { inline_keyboard: [[{ text: 'Открыть задачи', url }]] },
          delivery: { channels: ['max'] },
        },
      });
    } else if (channel === 'email' && email?.trim()) {
      appendDelivery(channel, {
        meta: {
          source: 'email',
          userId: task.ownerUserId,
          outboundMessageClass: 'routine_product',
          outboundCapability: 'essential_delivery',
        },
        payload: {
          recipient: { email: email.trim() },
          subject: 'Напоминание о задачах',
          message: { text },
          delivery: { channels: ['email'] },
        },
      });
    } else if (channel === 'web_push') {
      appendDelivery(channel, {
        meta: {
          source: 'web_push',
          userId: task.ownerUserId,
          outboundMessageClass: 'routine_product',
          outboundCapability: 'app_push',
        },
        payload: {
          recipient: { pushUserId: task.ownerUserId },
          title: 'Напоминание о задачах',
          url: '/app/doctor#doctor-today-global-tasks',
          message: { text: 'Проверьте задачи в кабинете.' },
          pushExtras: { tag: `specialist_task:${task.id}` },
          delivery: { channels: ['web_push'] },
        },
      });
    }
  }
  return deliveries;
}
