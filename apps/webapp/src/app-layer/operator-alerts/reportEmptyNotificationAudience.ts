import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import {
  EMPTY_AUDIENCE_JOB_FAMILY,
  EMPTY_AUDIENCE_JOB_KEY,
  mergeEmptyAudienceCounter,
  parseEmptyAudienceCounter,
  type EmptyAudienceEvent,
} from '@/modules/operator-alerts/emptyAudience';
import { parseOperatorAlertFallbackEmailSetting } from '@/modules/operator-alerts/operatorAlertFallbackEmail';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';

/**
 * Единственная точка, куда обязан приходить КАЖДЫЙ случай пустой аудитории (design D-b).
 *
 * Что здесь происходит и почему:
 *  1. структурированный лог `notification_audience_empty` — событие перестаёт быть невидимым;
 *  2. монотонный счётчик в `operator_job_status` — событие становится ИЗМЕРИМЫМ, а
 *     пятиминутный critical-tick поднимает по нему алерт (счётчик алертится сам по себе);
 *  3. для ОПЕРАЦИОННЫХ сообщений — доставка в обязательный fallback из глобальной
 *     restricted-настройки `operator_alert_fallback_email`.
 *
 * Пользовательское сообщение (пациенту лично) в fallback не уходит — его некому
 * переадресовать, — но считается и логируется наравне: тихим оно не остаётся.
 *
 * Функция никогда не бросает: она стоит на пути отправки и не имеет права его ломать.
 */

const EMPTY_AUDIENCE_FALLBACK_SUBJECT = 'BersonCare: некому доставить служебное уведомление';

type FallbackEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export type EmptyAudienceReporterDependencies = {
  readCounterMeta: () => Promise<unknown>;
  recordCounterFailure: (input: {
    event: EmptyAudienceEvent;
    nowIso: string;
    metaJson: Record<string, unknown>;
  }) => Promise<void>;
  readFallbackEmail: () => Promise<string | null>;
  sendFallbackEmail: (input: FallbackEmailInput) => Promise<boolean>;
  now: () => Date;
};

async function bumpCounter(
  dependencies: EmptyAudienceReporterDependencies,
  event: EmptyAudienceEvent,
  nowIso: string,
): Promise<number | null> {
  try {
    const existingMeta = await dependencies.readCounterMeta();
    const merged = mergeEmptyAudienceCounter(
      parseEmptyAudienceCounter(existingMeta),
      event,
      nowIso,
    );
    // Пишется как FAILURE-тик намеренно: пустая аудитория — это отказ доставки,
    // а не успешный прогон, и `last_error` должен это говорить прямым текстом.
    await dependencies.recordCounterFailure({
      event,
      nowIso,
      metaJson: merged as unknown as Record<string, unknown>,
    });
    return merged.total;
  } catch (err) {
    logger.warn({ err, topic: event.topic }, 'empty audience counter write failed');
    return null;
  }
}

async function deliverToFallback(
  dependencies: EmptyAudienceReporterDependencies,
  event: EmptyAudienceEvent,
  nowIso: string,
): Promise<'skipped' | 'sent' | 'failed'> {
  try {
    const address = await dependencies.readFallbackEmail();
    if (!address) return 'skipped';
    // Тема/каналы/context события сюда намеренно не попадают: boundary гарантирует, что
    // письмо не унесёт пациентские данные, даже если вызывающий код нарушил доменный контракт.
    const ok = await dependencies.sendFallbackEmail({
      to: address,
      subject: EMPTY_AUDIENCE_FALLBACK_SUBJECT,
      text: [
        'Служебное уведомление не имело ни одного адресата.',
        `Время: ${nowIso}`,
        'Проверьте журнал операторских алертов и настройки каналов доставки.',
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

export function createEmptyAudienceReporter(dependencies: EmptyAudienceReporterDependencies) {
  return async function report(event: EmptyAudienceEvent): Promise<ReportEmptyAudienceResult> {
    // Структурированный лог пишет доменный seam (`emptyAudienceRuntime`) — он срабатывает
    // даже когда этот репортер не зарегистрирован. Здесь только счётчик и fallback.
    const nowIso = dependencies.now().toISOString();

    const counterTotal = await bumpCounter(dependencies, event, nowIso);

    const fallback =
      event.severity === 'operational'
        ? await deliverToFallback(dependencies, event, nowIso)
        : ('not_applicable' as const);

    return { counterTotal, fallback };
  };
}

export async function reportEmptyNotificationAudience(
  event: EmptyAudienceEvent,
): Promise<ReportEmptyAudienceResult> {
  return runWithDbInfraPrincipal({ source: 'operator-cron-job-status:write' }, async () => {
    const appDeps = buildAppDeps();
    const report = createEmptyAudienceReporter({
      readCounterMeta: async () => {
        const existing = await appDeps.operatorHealthRead.getOperatorJobStatus(
          EMPTY_AUDIENCE_JOB_FAMILY,
          EMPTY_AUDIENCE_JOB_KEY,
        );
        return existing?.metaJson;
      },
      recordCounterFailure: async ({ event: failedEvent, nowIso, metaJson }) => {
        await appDeps.operatorHealthWrite.recordOperatorJobTickFailure({
          jobFamily: EMPTY_AUDIENCE_JOB_FAMILY,
          jobKey: EMPTY_AUDIENCE_JOB_KEY,
          startedAtIso: nowIso,
          durationMs: 0,
          error: `empty_audience:${failedEvent.topic}`,
          metaJson,
        });
      },
      readFallbackEmail: async () => {
        const setting = await appDeps.systemSettings.getSetting(
          'operator_alert_fallback_email',
          'admin',
          { organizationId: null },
        );
        return parseOperatorAlertFallbackEmailSetting(setting?.valueJson);
      },
      sendFallbackEmail: async (input) => {
        const { sendOperatorFallbackEmail } = await import('./sendOperatorFallbackEmail');
        return sendOperatorFallbackEmail(input);
      },
      now: () => new Date(),
    });
    return report(event);
  });
}

/** Регистрируется в `buildAppDeps` как реализация доменного seam. */
export async function emptyAudienceReporter(event: EmptyAudienceEvent): Promise<void> {
  await reportEmptyNotificationAudience(event);
}
