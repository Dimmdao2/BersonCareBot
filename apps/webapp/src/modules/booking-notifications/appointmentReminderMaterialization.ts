import type {
  AppointmentReminderMessengerStep,
  AppointmentReminderReadyOutgoingDelivery,
} from '@/modules/messaging/outgoingDeliveryQueuePort';
import { formatBookingDateTimeMediumRu } from '@/shared/lib/formatBusinessDateTime';

export type AppointmentReminderMaterializationInput = {
  organizationId: string;
  appointmentId: string;
  bookingId: string;
  platformUserId: string;
  slotStartIso: string;
  patientName: string | null;
  reminderPlan: { enabled: boolean; offsetsMinutes: number[] };
  cancelPending: boolean;
};

export type AppointmentReminderAudience = {
  selectedChannels: readonly string[];
  telegramId?: string;
  maxId?: string;
  hasWebPush: boolean;
};

function generationKey(input: AppointmentReminderMaterializationInput, dueAt: string): string {
  return `${input.appointmentId}:${encodeURIComponent(input.slotStartIso)}:${encodeURIComponent(dueAt)}`;
}

function messengerStep(channel: 'telegram' | 'max', externalId: string): AppointmentReminderMessengerStep {
  return channel === 'telegram'
    ? { channel, recipient: { chatId: externalId } }
    : { channel, recipient: { userId: externalId } };
}

/** Product-side materialization. The worker receives transport-ready rows and never chooses channels. */
export function prepareAppointmentReminderDeliveries(
  input: AppointmentReminderMaterializationInput,
  audience: AppointmentReminderAudience,
  nowIso: string,
  timeZone: string,
): AppointmentReminderReadyOutgoingDelivery[] {
  if (input.cancelPending || !input.reminderPlan.enabled) return [];
  const startMs = Date.parse(input.slotStartIso);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return [];

  const allowed = new Set(audience.selectedChannels);
  const baseLadder: AppointmentReminderMessengerStep[] = [];
  if (allowed.has('telegram') && audience.telegramId?.trim()) {
    baseLadder.push(messengerStep('telegram', audience.telegramId.trim()));
  }
  if (allowed.has('max') && audience.maxId?.trim()) {
    baseLadder.push(messengerStep('max', audience.maxId.trim()));
  }
  // Legacy effective semantics: two total attempts. With one channel it is tried twice;
  // with Telegram + MAX the retryable fallback is Telegram then MAX.
  const messengerLadder =
    baseLadder.length === 1 ? [baseLadder[0]!, baseLadder[0]!] : baseLadder.slice(0, 2);
  const occurredAt = nowIso;
  const patientLabel = input.patientName?.trim() || 'Пациент';
  const appointmentLabel = formatBookingDateTimeMediumRu(input.slotStartIso, timeZone);
  const deliveries: AppointmentReminderReadyOutgoingDelivery[] = [];

  for (const offsetMinutes of [...new Set(input.reminderPlan.offsetsMinutes)]) {
    if (!Number.isInteger(offsetMinutes) || offsetMinutes <= 0) continue;
    const dueAt = new Date(startMs - offsetMinutes * 60_000).toISOString();
    if (Date.parse(dueAt) <= nowMs) continue;
    const stable = generationKey(input, dueAt);
    const text = `${patientLabel}, Напоминание: приём ${appointmentLabel} (через ${offsetMinutes} мин.).`;

    if (messengerLadder.length > 0) {
      const first = messengerLadder[0]!;
      const eventId = `appointment-reminder:${stable}:messenger`;
      deliveries.push({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId,
        generationStartAt: input.slotStartIso,
        dueAt,
        eventId,
        kind: 'appointment_reminder',
        channel: first.channel,
        messengerLadder,
        nextRetryAt: dueAt,
        intent: {
          type: 'message.send',
          meta: {
            eventId,
            occurredAt,
            source: first.channel,
            userId: input.platformUserId,
            outboundMessageClass: 'routine_product',
            outboundCapability: 'essential_delivery',
          },
          payload: {
            recipient: first.recipient,
            message: { text },
            delivery: { channels: [first.channel], maxAttempts: 1 },
          },
        },
      });
    }

    if (allowed.has('web_push') && audience.hasWebPush) {
      const eventId = `appointment-reminder:${stable}:web_push`;
      deliveries.push({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId,
        generationStartAt: input.slotStartIso,
        dueAt,
        eventId,
        kind: 'appointment_reminder',
        channel: 'web_push',
        nextRetryAt: dueAt,
        intent: {
          type: 'message.send',
          meta: {
            eventId,
            occurredAt,
            source: 'web_push',
            userId: input.platformUserId,
            outboundMessageClass: 'routine_product',
            outboundCapability: 'app_push',
          },
          payload: {
            recipient: { pushUserId: input.platformUserId },
            title: 'Напоминание о записи',
            message: { text },
            url: '/app/patient/booking',
            pushExtras: { tag: eventId.slice(0, 240), topicCode: 'appointment_reminders' },
            delivery: { channels: ['web_push'], maxAttempts: 1 },
          },
        },
      });
    }
  }
  return deliveries;
}
