import type { DispatchPort } from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { getMaxBotInfo } from '../integrations/max/client.js';
import { maxConfig } from '../integrations/max/config.js';
import { probeGoogleCalendarAccess } from '../integrations/google-calendar/probe.js';
import { getGoogleCalendarConfig } from '../integrations/google-calendar/runtimeConfig.js';
import { getBotInstance } from '../integrations/telegram/client.js';
import { telegramConfig } from '../integrations/telegram/config.js';
import { reportOperatorFailure } from '../infra/operatorIncident/reportOperatorFailure.js';
import {
  recordOperatorOutboundProbeRun,
  resolveOpenOperatorIncidentsByDedupKeyPrefix,
} from '../infra/db/repos/operatorHealthDrizzle.js';
import {
  DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG,
  type OperatorHealthProbeConfig,
  type OperatorHealthProbeName,
} from './operatorHealthProbeSettings.js';

export type ProbeOutcome = 'ok' | 'fail' | 'skipped_not_configured';

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
  rubitime: ProbeOutcome;
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
  const probes = input.probes ?? ['max', 'telegram', 'rubitime', 'google_calendar'];
  const shouldProbe = (name: OperatorHealthProbeName) => probes.includes(name) && config[name].enabled;
  const details: Record<string, string> = {};
  let max: ProbeOutcome = 'skipped_not_configured';
  let rubitime: ProbeOutcome = 'skipped_not_configured';
  let telegram: ProbeOutcome = 'skipped_not_configured';
  let google_calendar: ProbeOutcome = 'skipped_not_configured';

  if (shouldProbe('max') && maxConfig.enabled && maxConfig.apiKey.trim().length > 0) {
    const info = await withProbeTimeout(getMaxBotInfo({ apiKey: maxConfig.apiKey }), config.max.timeoutMs).catch(() => null);
    if (info === null) {
      max = 'fail';
      details.max = 'getMyInfo returned null';
    } else {
      max = 'ok';
      details.max = 'ok';
      const n = await resolveOpenOperatorIncidentsByDedupKeyPrefix('outbound:max:');
      if (n > 0) details.maxResolved = String(n);
    }
  } else if (shouldProbe('max')) {
    details.max = 'skipped_not_configured';
  }

  details.rubitime = shouldProbe('rubitime') ? 'retired' : 'disabled_or_not_due';

  if (shouldProbe('telegram') && telegramConfig.botToken.trim().length > 0) {
    try {
      await withProbeTimeout(
        getBotInstance().api.getMe(),
        config.telegram.timeoutMs,
      );
      telegram = 'ok';
      details.telegram = 'ok';
      const n = await resolveOpenOperatorIncidentsByDedupKeyPrefix('outbound:telegram:');
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
    const gcalConfig = await getGoogleCalendarConfig();
    if (gcalConfig.enabled && gcalConfig.refreshToken?.trim()) {
      await probeGoogleCalendarAccess(
        fetchWithTimeout(config.google_calendar.timeoutMs),
        async () => gcalConfig,
      );
      google_calendar = 'ok';
      details.google_calendar = 'ok';
      const n = await resolveOpenOperatorIncidentsByDedupKeyPrefix('outbound:google_calendar:');
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
    const streak = await recordOperatorOutboundProbeRun({
      max,
      rubitime,
      telegram,
      google_calendar,
      probed: probes.filter((name) => config[name].enabled),
    });
    details.consecutiveFailRuns = String(streak.consecutiveFailRuns);
    const failures: Array<[OperatorHealthProbeName, ProbeOutcome, string, string, string]> = [
      ['max', max, 'max', 'max_probe_failed', 'MAX probe failed'],
      ['telegram', telegram, 'telegram', 'telegram_probe_failed', 'Telegram getMe probe failed'],
      ['google_calendar', google_calendar, 'google_calendar', 'google_calendar_probe_failed', 'Google Calendar probe failed'],
    ];
    for (const [name, outcome, integration, errorClass, title] of failures) {
      if (outcome !== 'fail' || (streak.consecutiveFailures[name] ?? 0) < config[name].consecutiveFailures) continue;
      const detail = details[name] ?? 'probe failed';
      await reportOperatorFailure({
        dispatchPort: input.dispatchPort,
        direction: 'outbound', integration, errorClass, errorDetail: detail, alertLines: [title, detail],
      });
    }
  } catch (err) {
    logger.warn({ err }, 'operator_health_probe_job_status_failed');
  }

  logger.info({ max, rubitime, telegram, google_calendar, details }, 'operator_health_probes_done');
  return { max, rubitime, telegram, google_calendar, details };
}
