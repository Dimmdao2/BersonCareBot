import { logger } from '../observability/logger.js';
import { reportOperatorFailure } from './reportOperatorFailure.js';

/**
 * ЕДИНСТВЕННАЯ точка, через которую уходит «уведомлению некому уйти» на стороне интегратора.
 *
 * Почему она появилась (18.08): каждое место отправки писало свой `logger.warn` с
 * `event: 'notification_audience_empty'` и на этом останавливалось. Владелец сделал запись,
 * три уведомления не ушли никому, и об этом никто не узнал до тех пор, пока он сам не полез в
 * журнал. Механизм инцидентов при этом уже стоял рядом (`reportOperatorFailure`) — им просто
 * никто не пользовался с этого пути; в коде висел комментарий «счётчик живёт в вебаппе и отсюда
 * недостижим», который неверен: durable-инцидент живёт в базе интегратора.
 *
 * Второе, что здесь чинится, — ПОДМЕНА ПРИЧИНЫ. Отказ резолвера аудитории (вебапп ответил
 * ошибкой) и честно пустой список каналов — это два разных отказа с разной починкой, а
 * записывались они одной строкой «no delivery target». Из-за этого поиск причины занял часы.
 *
 * Функция НИКОГДА не бросает: она стоит на пути отправки и не имеет права его ломать.
 */

/** Почему аудитория оказалась пустой. Значения низкой кардинальности — они идут в dedup-ключ. */
export type EmptyAudienceReason =
  /** Резолвер аудитории не ответил (HTTP-ошибка, таймаут, отказ прав) — список НЕ ИЗВЕСТЕН. */
  | 'resolution_failed'
  /** Резолвер ответил, и в ответе нет ни одного канала доставки. */
  | 'no_channel_bindings';

export type EmptyNotificationAudienceEvent = {
  /** Тема уведомления, например `booking_linked_channel_message`. Низкая кардинальность. */
  topic: string;
  /** `user_facing` — сообщение живому человеку; `operational` — служебное. */
  severity: 'user_facing' | 'operational';
  reason: EmptyAudienceReason;
  organizationId?: string | undefined;
};

/** Направление инцидента: отказ доставки уведомления, а не отказ провайдера. */
export const EMPTY_AUDIENCE_INCIDENT_DIRECTION = 'outbound_notification';

/**
 * Dedup-ключ инцидента — `direction:integration:errorClass`, то есть
 * `outbound_notification:<topic>:empty_audience_<reason>`.
 *
 * Ни organizationId, ни идентификатор события в него НЕ входят намеренно: одна сломанная тема
 * обязана открыть ОДИН инцидент и дальше только увеличивать `occurrence_count`. Немедленный
 * алерт админам `reportOperatorFailure` шлёт лишь при первом открытии; дальнейшая эскалация
 * (T0 → +1ч → суточный дайджест) и авто-закрытие остаются за критик-тиком вебаппа.
 */
export function emptyAudienceErrorClass(reason: EmptyAudienceReason): string {
  return `empty_audience_${reason}`;
}

function alertLines(event: EmptyNotificationAudienceEvent): string[] {
  const what =
    event.severity === 'user_facing'
      ? 'Уведомление пользователю не ушло никому.'
      : 'Служебное уведомление не ушло никому.';
  const why =
    event.reason === 'resolution_failed'
      ? 'Причина: резолвер аудитории не ответил — список получателей неизвестен.'
      : 'Причина: у получателя нет ни одного канала доставки.';
  return ['Критичный сбой: уведомлению некому уйти', what, `Тема: ${event.topic}`, why];
}

export async function reportEmptyNotificationAudience(
  event: EmptyNotificationAudienceEvent,
): Promise<void> {
  logger.warn(
    {
      scope: 'notification_delivery',
      event: 'notification_audience_empty',
      topic: event.topic,
      severity: event.severity,
      reason: event.reason,
      ...(event.organizationId ? { organizationId: event.organizationId } : {}),
    },
    'notification resolved to an empty audience',
  );
  try {
    await reportOperatorFailure({
      direction: EMPTY_AUDIENCE_INCIDENT_DIRECTION,
      integration: event.topic,
      errorClass: emptyAudienceErrorClass(event.reason),
      errorDetail: event.severity,
      alertLines: alertLines(event),
    });
  } catch (err) {
    // Отказ самого механизма инцидентов не имеет права уронить отправку — но и он не тихий.
    logger.warn(
      { err, scope: 'notification_delivery', event: 'empty_audience_incident_failed', topic: event.topic },
      'empty audience incident could not be recorded',
    );
  }
}
