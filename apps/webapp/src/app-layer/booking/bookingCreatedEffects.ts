/**
 * Пациентское уведомление о созданной записи — работа вебаппа, а не интегратора.
 *
 * Владелец 19.08: «Про событие записи вижу явный косяк — интегратор тут вообще ни при чем. Запись
 * делает вебапп. Напоминания и отправку уведомлений — интегратор с шедулером.»
 *
 * До этой работы вебапп на пути создания записи звал интегратор подписанным HTTP, а интегратор
 * ходил обратно в вебапп за каналами пациента — то есть за ВЕБАПП-данными, через сеть, туда и
 * обратно, внутри запроса пациента. Отправлял он их тоже сам, синхронно в Telegram/MAX API.
 * Здесь получателя и текст определяет вебапп по своей базе, а сообщение кладётся строкой в очередь
 * доставки (`app.enqueue_outbound_message`) — отправит воркер интегратора. Ровно так, как сказано:
 * запись — вебапп, отправка — интегратор.
 *
 * Побочный, но важный эффект: `event_id` строки очереди уникален навсегда, поэтому повтор события
 * (вебапп повторяет его до трёх раз, если интегратор ответил 502) больше не может отправить
 * пациенту второе такое же сообщение. Синхронный `dispatchOutgoing` дедупа не имел вовсе.
 *
 * Чего здесь НЕТ и почему — в отчёте по задаче: уведомление персонала и материализация напоминаний
 * упираются в объявленную поверхность порт-контекста, а не в код.
 */

import { logger, serializeError } from '@/infra/logging/logger';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { reportEmptyAudience } from '@/modules/operator-alerts/emptyAudienceRuntime';
import type {
  BookingCreatedEffectsInput,
  BookingCreatedEffectsPort,
} from '@/modules/booking-notifications/bookingCreatedEffectsPort';
import type { DeliveryTargetsApiResult } from '@/modules/integrator/deliveryTargetsApi';
import type {
  OutboundMessageChannel,
  OutboundMessageContent,
  OutboundMessageQueuePort,
} from '@/modules/messaging/outboundMessageQueuePort';
import {
  buildPatientAwaitingPaymentMessageText,
  buildPatientCreatedMessageText,
} from '@/modules/patient-booking/patientMessageText';
import { NOTIFICATION_TOPIC_APPOINTMENT } from '@/modules/patient-notifications/notificationTopicCodes';

/** Тема «пациент ничего не получил». Низкая кардинальность — она входит в ключ дедупа инцидента. */
export const BOOKING_CREATED_PATIENT_TOPIC = 'booking_created_patient_message';

/** Столько же попыток, сколько ставил интегратор в `delivery.maxAttempts` для этого сообщения. */
const MESSENGER_MAX_ATTEMPTS = 3;

export type BookingCreatedEffectsDeps = {
  outboundMessageQueue: OutboundMessageQueuePort;
  deliveryTargets: {
    getTargets(params: {
      organizationId: string;
      phone?: string;
      platformUserId?: string;
      topic?: string;
    }): Promise<DeliveryTargetsApiResult | null>;
  };
};

function messengerRecipients(
  bindings: { telegramId?: string; maxId?: string } | undefined,
): Array<{ channel: 'telegram' | 'max'; recipient: string }> {
  const out: Array<{ channel: 'telegram' | 'max'; recipient: string }> = [];
  const telegramId = bindings?.telegramId?.trim();
  if (telegramId) out.push({ channel: 'telegram', recipient: telegramId });
  const maxId = bindings?.maxId?.trim();
  if (maxId) out.push({ channel: 'max', recipient: maxId });
  return out;
}

type AwaitingPaymentRecipient = {
  channel: Extract<OutboundMessageChannel, 'telegram' | 'max' | 'email' | 'web_push'>;
  recipient: string;
};

/**
 * The target snapshot has already gone through `resolvePatientNotificationChannels` for the
 * appointment topic. Do not infer recipients from contact fields here: a missing selection is a
 * deliberate outcome (including an unverified email), not a fallback opportunity.
 */
function awaitingPaymentRecipients(
  targets: DeliveryTargetsApiResult | null,
  platformUserId: string | null,
): AwaitingPaymentRecipient[] {
  const selected = new Set(targets?.resolution?.selectedChannels ?? []);
  const recipients: AwaitingPaymentRecipient[] = [];
  const telegramId = targets?.channelBindings.telegramId?.trim();
  if (selected.has('telegram') && telegramId) {
    recipients.push({ channel: 'telegram', recipient: telegramId });
  }
  const maxId = targets?.channelBindings.maxId?.trim();
  if (selected.has('max') && maxId) {
    recipients.push({ channel: 'max', recipient: maxId });
  }
  const emailRecipient = targets?.emailRecipient?.trim();
  if (selected.has('email') && emailRecipient) {
    recipients.push({ channel: 'email', recipient: emailRecipient });
  }
  if (selected.has('web_push') && platformUserId) {
    recipients.push({ channel: 'web_push', recipient: platformUserId });
  }
  return recipients;
}

function awaitingPaymentContent(
  input: BookingCreatedEffectsInput,
  channel: AwaitingPaymentRecipient['channel'],
): OutboundMessageContent {
  const awaitingPayment = input.awaitingPayment;
  if (!awaitingPayment) throw new Error('awaiting_payment_message_required');
  const text = buildPatientAwaitingPaymentMessageText(awaitingPayment, input.timeZone);
  if (channel === 'email') {
    return { text, subject: 'Оплата записи', senderScope: 'clinic_if_configured' };
  }
  if (channel === 'web_push') {
    return {
      text,
      title: 'Оплатите запись',
      url: awaitingPayment.checkoutUrl,
      senderScope: 'clinic_if_configured',
    };
  }
  return { text, senderScope: 'clinic_if_configured' };
}

export function createBookingCreatedEffects(
  deps: BookingCreatedEffectsDeps,
): BookingCreatedEffectsPort {
  /**
   * Снимок каналов пациента читается объявленным корнем
   * `app.read_integrator_delivery_target_snapshot(...)`, у которого объявлен ОДИН класс контекста —
   * `tenant_service`. Поэтому чтение идёт под организационным принципалом: тем же швом, которым
   * пользуется публичный маршрут `/api/booking/in-person-services`. Новой возможности не заводится.
   */
  async function resolvePatientTargets(
    input: BookingCreatedEffectsInput,
  ): Promise<DeliveryTargetsApiResult | null> {
    return withExplicitOrganizationPrincipal(
      { organizationId: input.organizationId, source: 'booking.created.patient-delivery-targets' },
      () =>
        deps.deliveryTargets.getTargets({
          organizationId: input.organizationId,
          ...(input.platformUserId
            ? { platformUserId: input.platformUserId }
            : input.contactPhone
              ? { phone: input.contactPhone }
              : {}),
          ...(input.awaitingPayment ? { topic: NOTIFICATION_TOPIC_APPOINTMENT } : {}),
        }),
    );
  }

  return {
    async apply(input) {
      if (!input.notifyPatient) return;
      try {
        const targets = await resolvePatientTargets(input);
        const recipients = input.awaitingPayment
          ? awaitingPaymentRecipients(targets, input.platformUserId)
          : messengerRecipients(targets?.channelBindings);
        if (recipients.length === 0) {
          if (input.awaitingPayment) {
            // No confirmed and enabled delivery channel is normal for a self-booking. In
            // particular, a form email is never used as a fallback unless the resolver selected
            // the verified identity email above.
            return;
          }
          // Пустая аудитория никогда не тихий успех: отдельно «не нашли» и «не к кому».
          await reportEmptyAudience({
            topic: BOOKING_CREATED_PATIENT_TOPIC,
            severity: 'user_facing',
            channels: ['telegram', 'max'],
            context: {
              organizationId: input.organizationId,
              reason: targets ? 'no_channel_bindings' : 'resolution_failed',
            },
          });
          return;
        }
        const text = buildPatientCreatedMessageText(
          {
            slotStart: input.slotStart,
            bookingType: input.bookingType,
            city: input.city,
            cityCodeSnapshot: input.cityCodeSnapshot,
          },
          input.timeZone,
        );
        for (const target of recipients) {
          const awaitingPayment = input.awaitingPayment;
          await deps.outboundMessageQueue.enqueue({
            organizationId: input.organizationId,
            purpose: awaitingPayment
              ? 'booking.awaiting_payment.patient'
              : 'booking.created.patient',
            idempotencyKey: awaitingPayment
              ? `${input.bookingId}:awaiting_payment:${target.channel}:${target.recipient}`
              : `${input.bookingId}:${target.channel}:${target.recipient}`,
            channel: target.channel,
            recipient: target.recipient,
            content: awaitingPayment
              ? awaitingPaymentContent(input, target.channel)
              : { text, senderScope: 'clinic_if_configured' },
            maxAttempts: MESSENGER_MAX_ATTEMPTS,
          });
        }
      } catch (err) {
        // Запись уже зафиксирована — отказ доставки её не отменяет. Но и не молчит: он уходит тем
        // же портом, что и пустая аудитория, потому что итог для человека тот же — он не получил.
        logger.error(
          {
            scope: 'booking_created_effects',
            topic: BOOKING_CREATED_PATIENT_TOPIC,
            organizationId: input.organizationId,
            err: serializeError(err),
          },
          'booking created patient notification failed',
        );
        await reportEmptyAudience({
          topic: BOOKING_CREATED_PATIENT_TOPIC,
          severity: 'user_facing',
          channels: ['telegram', 'max'],
          context: { organizationId: input.organizationId, reason: 'enqueue_failed' },
        });
      }
    },
  };
}
