import type { DispatchPort } from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { getMaxBotInfo } from '../integrations/max/client.js';
import {
  getMaxRuntimeConfig,
  getTelegramRuntimeConfig,
} from '../infra/adapters/integrationRuntimeConfig.js';
import { probeGoogleCalendarAccess } from '../integrations/google-calendar/probe.js';
import {
  getGoogleCalendarConfig,
  listGoogleCalendarProbeOrganizationIds,
} from '../integrations/google-calendar/runtimeConfig.js';
import { getBotInstance } from '../integrations/telegram/client.js';
import {
  OUTBOUND_PROVIDER_INCIDENT_DIRECTION,
  classifyOutboundProviderErrorClass,
  isPageOnFirstOccurrenceProviderErrorClass,
} from '@bersoncare/operator-db-schema';
import { reportOperatorFailure } from '../infra/operatorIncident/reportOperatorFailure.js';
import {
  recordOperatorOutboundProbeRun,
  resolveOpenOperatorOutboundProbeIncidents,
} from '../infra/db/repos/operatorHealthDrizzle.js';
import {
  DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG,
  isOperatorHealthProbeQuiet,
  type OperatorHealthProbeConfig,
  type OperatorHealthProbeName,
} from './operatorHealthProbeSettings.js';

export type ProbeOutcome = 'ok' | 'fail' | 'skipped_not_configured';

const lastProbeAttemptAtMs = new Map<OperatorHealthProbeName, number>();

/** Test isolation for the process-local retry floor. */
export function resetOperatorHealthProbeAttemptFloorForTest(): void {
  lastProbeAttemptAtMs.clear();
}

function withProbeTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('probe_timeout')), timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input, init) =>
    globalThis.fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
}

export type OperatorHealthProbeRunResult = {
  max: ProbeOutcome;
  telegram: ProbeOutcome;
  google_calendar: ProbeOutcome;
  details: Record<string, string>;
};

/**
 * Синтетические пробы внешних каналов; при успехе — resolve открытых probe-инцидентов по префиксу.
 */
export async function runOperatorHealthProbes(input: {
  dispatchPort: DispatchPort;
  config?: OperatorHealthProbeConfig;
  probes?: readonly OperatorHealthProbeName[];
}): Promise<OperatorHealthProbeRunResult> {
  const config = input.config ?? DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG;
  if (isOperatorHealthProbeQuiet(config)) {
    return {
      max: 'skipped_not_configured',
      telegram: 'skipped_not_configured',
      google_calendar: 'skipped_not_configured',
      details: { quietWindow: 'active' },
    };
  }
  const requestedProbes = input.probes ?? ['max', 'telegram', 'google_calendar'];
  const attemptStartedAtMs = Date.now();
  const probes = requestedProbes.filter((name) => {
    if (!config[name].enabled) return false;
    const lastAttemptAtMs = lastProbeAttemptAtMs.get(name);
    return (
      lastAttemptAtMs === undefined ||
      attemptStartedAtMs - lastAttemptAtMs >= config[name].intervalMs
    );
  });
  for (const name of probes) {
    // Mark before touching the provider: even a persistence failure must not make the 5-second
    // scheduler poll immediately repeat a probe that already consumed provider capacity.
    lastProbeAttemptAtMs.set(name, attemptStartedAtMs);
  }
  const shouldProbe = (name: OperatorHealthProbeName) =>
    probes.includes(name) && config[name].enabled;
  const details: Record<string, string> = {};
  let max: ProbeOutcome = 'skipped_not_configured';
  let telegram: ProbeOutcome = 'skipped_not_configured';
  let google_calendar: ProbeOutcome = 'skipped_not_configured';

  const maxRuntimeConfig = shouldProbe('max') ? await getMaxRuntimeConfig() : null;
  if (shouldProbe('max') && maxRuntimeConfig?.enabled) {
    const info = await withProbeTimeout(
      getMaxBotInfo({ apiKey: maxRuntimeConfig.apiKey, baseUrl: maxRuntimeConfig.baseUrl }),
      config.max.timeoutMs,
    ).catch(() => null);
    if (info === null) {
      max = 'fail';
      details.max = 'getMyInfo returned null';
    } else {
      max = 'ok';
      details.max = 'ok';
      const n = await resolveOpenOperatorOutboundProbeIncidents('max');
      if (n > 0) details.maxResolved = String(n);
    }
  } else if (shouldProbe('max')) {
    details.max = 'skipped_not_configured';
  }

  const telegramRuntimeConfig = shouldProbe('telegram') ? await getTelegramRuntimeConfig() : null;
  if (shouldProbe('telegram') && telegramRuntimeConfig?.enabled) {
    try {
      await withProbeTimeout((await getBotInstance()).api.getMe(), config.telegram.timeoutMs);
      telegram = 'ok';
      details.telegram = 'ok';
      const n = await resolveOpenOperatorOutboundProbeIncidents('telegram');
      if (n > 0) details.telegramResolved = String(n);
    } catch (err) {
      telegram = 'fail';
      const msg = err instanceof Error ? err.message : String(err);
      details.telegram = msg;
    }
  } else if (shouldProbe('telegram')) {
    details.telegram = 'skipped_not_configured';
  }

  if (shouldProbe('google_calendar')) {
    try {
      const organizationIds = await listGoogleCalendarProbeOrganizationIds();
      let gcalConfig: Awaited<ReturnType<typeof getGoogleCalendarConfig>> | null = null;
      let probedOrganizationId: string | null = null;
      for (const organizationId of organizationIds) {
        const candidate = await getGoogleCalendarConfig(organizationId);
        if (candidate.enabled && candidate.refreshToken?.trim()) {
          gcalConfig = candidate;
          probedOrganizationId = organizationId;
          break;
        }
      }
      const selectedConfig = gcalConfig;
      if (selectedConfig && probedOrganizationId) {
        await probeGoogleCalendarAccess(
          fetchWithTimeout(config.google_calendar.timeoutMs),
          async () => selectedConfig,
        );
        google_calendar = 'ok';
        details.google_calendar = 'ok';
        details.google_calendarConfiguredOrganizations = String(organizationIds.length);
        const n = await resolveOpenOperatorOutboundProbeIncidents('google_calendar');
        if (n > 0) details.google_calendarResolved = String(n);
      } else {
        details.google_calendar = 'skipped_not_configured';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'not_configured') {
        details.google_calendar = 'skipped_not_configured';
      } else {
        google_calendar = 'fail';
        details.google_calendar = msg;
      }
    }
  }

  try {
    if (probes.length === 0) {
      logger.info({ requestedProbes }, 'operator_health_probes_suppressed_by_attempt_floor');
      return { max, telegram, google_calendar, details };
    }
    const streak = await recordOperatorOutboundProbeRun({
      max,
      telegram,
      google_calendar,
      probed: probes.filter((name) => config[name].enabled),
    });
    details.consecutiveFailRuns = String(streak.consecutiveFailRuns);
    const failures: Array<[OperatorHealthProbeName, ProbeOutcome, string, string, string]> = [
      ['max', max, 'max', 'max_probe_failed', 'MAX probe failed'],
      ['telegram', telegram, 'telegram', 'telegram_probe_failed', 'Telegram getMe probe failed'],
      [
        'google_calendar',
        google_calendar,
        'google_calendar',
        'google_calendar_probe_failed',
        'Google Calendar probe failed',
      ],
    ];
    for (const [name, outcome, integration, probeErrorClass, title] of failures) {
      if (outcome !== 'fail') continue;
      const detail = details[name] ?? 'probe failed';

      // Один канал не должен топить отчёт по остальным: `open_or_touch_operator_probe_incident`
      // умеет отвергнуть незнакомую пару (integration, error_class) исключением (`23514`), и до
      // этой правки такое исключение рвало ВЕСЬ `for`, теряя отчёт по каналам, идущим следом за
      // отказавшим (порядок обхода — max, telegram, google_calendar). Каждая итерация теперь
      // изолирована: сбой репорта по одному каналу — warn и следующий канал, не потеря остальных.
      try {
        // Решение владельца 21.07: отказ провайдера по учётным данным/квоте пейджится с ПЕРВОГО
        // появления. Проба до этого складывала ЛЮБУЮ причину в один класс `<провайдер>_probe_failed`
        // и ждала трёх промахов подряд, поэтому телеграмный `401 Unauthorized` был неотличим от
        // таймаута и молчал столько же. Разбор текста ошибки — тот же, что у настоящей отправки;
        // отдельного словаря у пробы нет.
        const providerErrorClass = classifyOutboundProviderErrorClass(detail);
        if (isPageOnFirstOccurrenceProviderErrorClass(providerErrorClass)) {
          details[`${name}ProviderErrorClass`] = providerErrorClass;
          await reportOperatorFailure({
            dispatchPort: input.dispatchPort,
            direction: OUTBOUND_PROVIDER_INCIDENT_DIRECTION,
            integration,
            errorClass: providerErrorClass,
            errorDetail: detail,
            alertLines: [title, detail],
          });
          continue;
        }

        if ((streak.consecutiveFailures[name] ?? 0) < config[name].consecutiveFailures) continue;
        await reportOperatorFailure({
          dispatchPort: input.dispatchPort,
          direction: 'outbound',
          integration,
          errorClass: probeErrorClass,
          errorDetail: detail,
          alertLines: [title, detail],
        });
      } catch (err) {
        logger.warn({ err, name, integration }, 'operator_health_probe_report_failure_failed');
      }
    }
  } catch (err) {
    logger.warn({ err }, 'operator_health_probe_job_status_failed');
  }

  logger.info({ max, telegram, google_calendar, details }, 'operator_health_probes_done');
  return { max, telegram, google_calendar, details };
}
