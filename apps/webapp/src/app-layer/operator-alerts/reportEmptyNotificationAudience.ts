import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { env } from '@/config/env';
import {
  EMPTY_AUDIENCE_JOB_FAMILY,
  EMPTY_AUDIENCE_JOB_KEY,
  mergeEmptyAudienceCounter,
  parseEmptyAudienceCounter,
  type EmptyAudienceEvent,
} from '@/modules/operator-alerts/emptyAudience';

/**
 * Единственная точка, куда обязан приходить КАЖДЫЙ случай пустой аудитории (design D-b).
 *
 * Что здесь происходит и почему:
 *  1. структурированный лог `notification_audience_empty` — событие перестаёт быть невидимым;
 *  2. монотонный счётчик в `operator_job_status` — событие становится ИЗМЕРИМЫМ, а
 *     пятиминутный critical-tick поднимает по нему алерт (счётчик алертится сам по себе);
 *  3. для ОПЕРАЦИОННЫХ сообщений — доставка в fallback из окружения
 *     (`OPERATOR_ALERT_FALLBACK_EMAIL`), который нельзя убрать настройкой из админки.
 *
 * Пользовательское сообщение (пациенту лично) в fallback не уходит — его некому
 * переадресовать, — но считается и логируется наравне: тихим оно не остаётся.
 *
 * Функция никогда не бросает: она стоит на пути отправки и не имеет права его ломать.
 */

const EMPTY_AUDIENCE_FALLBACK_SUBJECT = 'BersonCare: некому доставить служебное уведомление';

async function bumpCounter(event: EmptyAudienceEvent, nowIso: string): Promise<number | null> {
  try {
    const deps = buildAppDeps();
    const existing = await deps.operatorHealthRead.getOperatorJobStatus(
      EMPTY_AUDIENCE_JOB_FAMILY,
      EMPTY_AUDIENCE_JOB_KEY,
    );
    const merged = mergeEmptyAudienceCounter(
      parseEmptyAudienceCounter(existing?.metaJson),
      event,
      nowIso,
    );
    // Пишется как FAILURE-тик намеренно: пустая аудитория — это отказ доставки,
    // а не успешный прогон, и `last_error` должен это говорить прямым текстом.
    await deps.operatorHealthWrite.recordOperatorJobTickFailure({
      jobFamily: EMPTY_AUDIENCE_JOB_FAMILY,
      jobKey: EMPTY_AUDIENCE_JOB_KEY,
      startedAtIso: nowIso,
      durationMs: 0,
      error: `empty_audience:${event.topic}`,
      metaJson: merged as unknown as Record<string, unknown>,
    });
    return merged.total;
  } catch (err) {
    logger.warn({ err, topic: event.topic }, 'empty audience counter write failed');
    return null;
  }
}

async function deliverToFallback(
  event: EmptyAudienceEvent,
  nowIso: string,
): Promise<'skipped' | 'sent' | 'failed'> {
  const address = env.OPERATOR_ALERT_FALLBACK_EMAIL;
  if (!address) return 'skipped';
  try {
    const { sendOperatorFallbackEmail } = await import('./sendOperatorFallbackEmail');
    // Содержимое намеренно бессодержательное про людей (design D-h): тема и ключ места,
    // никаких имён, диагнозов и текста исходного сообщения.
    const ok = await sendOperatorFallbackEmail({
      to: address,
      subject: EMPTY_AUDIENCE_FALLBACK_SUBJECT,
      text: [
        'Служебное уведомление не имело ни одного адресата.',
        `Место: ${event.topic}`,
        `Каналы: ${event.channels.join(', ') || 'нет'}`,
        `Время: ${nowIso}`,
        'Это сообщение отправлено на fallback-адрес из окружения, потому что рассчитанная аудитория оказалась пустой.',
      ].join('\n'),
    });
    return ok ? 'sent' : 'failed';
  } catch (err) {
    logger.warn({ err, topic: event.topic }, 'empty audience fallback delivery failed');
    return 'failed';
  }
}

export type ReportEmptyAudienceResult = {
  counterTotal: number | null;
  fallback: 'skipped' | 'sent' | 'failed' | 'not_applicable';
};

export async function reportEmptyNotificationAudience(
  event: EmptyAudienceEvent,
): Promise<ReportEmptyAudienceResult> {
  // Структурированный лог пишет доменный seam (`emptyAudienceRuntime`) — он срабатывает
  // даже когда этот репортер не зарегистрирован. Здесь только счётчик и fallback.
  const nowIso = new Date().toISOString();

  const counterTotal = await bumpCounter(event, nowIso);

  const fallback =
    event.severity === 'operational'
      ? await deliverToFallback(event, nowIso)
      : ('not_applicable' as const);

  return { counterTotal, fallback };
}

/** Регистрируется в `buildAppDeps` как реализация доменного seam. */
export async function emptyAudienceReporter(event: EmptyAudienceEvent): Promise<void> {
  await reportEmptyNotificationAudience(event);
}
