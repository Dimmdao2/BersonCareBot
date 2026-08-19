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
import type { OutboundMessageQueuePort } from '@/modules/messaging/outboundMessageQueuePort';
import { buildPatientCreatedMessageText } from '@/modules/patient-booking/patientMessageText';

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
        }),
    );
  }

  return {
    async apply(input) {
      if (!input.notifyPatient) return;
      try {
        const targets = await resolvePatientTargets(input);
        const recipients = messengerRecipients(targets?.channelBindings);
        if (recipients.length === 0) {
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
          await deps.outboundMessageQueue.enqueue({
            organizationId: input.organizationId,
            purpose: 'booking.created.patient',
            idempotencyKey: `${input.bookingId}:${target.channel}:${target.recipient}`,
            channel: target.channel,
            recipient: target.recipient,
            content: { text },
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
