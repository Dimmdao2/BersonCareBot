import type { ReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';
import {
  resolveSpecialistTaskReminderChannelsForUser,
  type ResolveSpecialistTaskReminderChannelsDeps,
} from '@/modules/doctor-notifications/resolveSpecialistTaskReminderChannels';
import type { SpecialistTaskRow } from './types';

export type PrepareSpecialistTaskReminderDeliveriesDeps = ResolveSpecialistTaskReminderChannelsDeps & {
  resolvePatientDisplayName: (patientUserId: string) => Promise<string | null>;
};

function reminderText(task: SpecialistTaskRow, patientName: string | null): string {
  const lines = ['Напоминание о задаче'];
  if (patientName?.trim()) lines.push(`Пациент: ${patientName.trim()}`);
  lines.push(task.title);
  if (task.dueAt) lines.push(`Срок: ${new Date(task.dueAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`);
  return lines.join('\n');
}

function eventId(task: SpecialistTaskRow, channel: ReadyOutgoingDelivery['channel']): string {
  return `specialist-task:${task.id}:${encodeURIComponent(task.remindAt ?? '')}:${channel}`;
}

/** Webapp resolves all recipients, channels, text and absolute due time before durable enqueue. */
export async function prepareSpecialistTaskReminderDeliveries(
  task: SpecialistTaskRow,
  deps: PrepareSpecialistTaskReminderDeliveriesDeps,
): Promise<ReadyOutgoingDelivery[]> {
  if (!task.organizationId || !task.remindAt || task.completedAt) return [];
  const [channels, bindings, email, patientName] = await Promise.all([
    resolveSpecialistTaskReminderChannelsForUser(task.ownerUserId, deps),
    deps.getChannelBindings(task.ownerUserId),
    deps.getProfileEmail(task.ownerUserId),
    task.patientUserId ? deps.resolvePatientDisplayName(task.patientUserId) : Promise.resolve(null),
  ]);
  const text = reminderText(task, patientName);
  const occurredAt = new Date().toISOString();
  const deliveries: ReadyOutgoingDelivery[] = [];
  for (const channel of channels) {
    const id = eventId(task, channel);
    const base = {
      organizationId: task.organizationId,
      eventId: id,
      kind: 'specialist_task_reminder' as const,
      channel,
      nextRetryAt: task.remindAt,
    };
    if (channel === 'telegram' && bindings.telegramId?.trim()) {
      deliveries.push({ ...base, intent: { type: 'message.send', meta: { eventId: id, occurredAt, source: 'telegram', userId: task.ownerUserId, outboundMessageClass: 'routine_product', outboundCapability: 'essential_delivery' }, payload: { recipient: { chatId: bindings.telegramId.trim() }, message: { text }, delivery: { channels: ['telegram'] } } } });
    } else if (channel === 'max' && bindings.maxId?.trim()) {
      deliveries.push({ ...base, intent: { type: 'message.send', meta: { eventId: id, occurredAt, source: 'max', userId: task.ownerUserId, outboundMessageClass: 'routine_product', outboundCapability: 'essential_delivery' }, payload: { recipient: { userId: bindings.maxId.trim() }, message: { text }, delivery: { channels: ['max'] } } } });
    } else if (channel === 'email' && email?.trim()) {
      deliveries.push({ ...base, intent: { type: 'message.send', meta: { eventId: id, occurredAt, source: 'email', userId: task.ownerUserId, outboundMessageClass: 'routine_product', outboundCapability: 'essential_delivery' }, payload: { recipient: { email: email.trim() }, subject: 'Напоминание о задаче', message: { text }, delivery: { channels: ['email'] } } } });
    } else if (channel === 'web_push') {
      deliveries.push({ ...base, intent: { type: 'message.send', meta: { eventId: id, occurredAt, source: 'web_push', userId: task.ownerUserId, outboundMessageClass: 'routine_product', outboundCapability: 'app_push' }, payload: { recipient: { pushUserId: task.ownerUserId }, title: 'Задача', url: task.patientUserId ? `/app/doctor/clients/${task.patientUserId}#doctor-client-section-tasks` : '/app/doctor#doctor-today-global-tasks', message: { text: task.title }, pushExtras: { tag: `specialist_task:${task.id}` }, delivery: { channels: ['web_push'] } } } });
    }
  }
  return deliveries;
}
