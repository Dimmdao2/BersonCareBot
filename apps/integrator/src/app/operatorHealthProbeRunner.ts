import type { DispatchPort } from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { createDbPort } from '../infra/db/client.js';
import { getMaxBotInfo } from '../integrations/max/client.js';
import { maxConfig } from '../integrations/max/config.js';
import { probeGoogleCalendarAccess } from '../integrations/google-calendar/probe.js';
import { getGoogleCalendarConfig } from '../integrations/google-calendar/runtimeConfig.js';
import { fetchRubitimeSchedule } from '../integrations/rubitime/client.js';
import { pickAnyActiveRubitimeScheduleTriple } from '../integrations/rubitime/db/bookingProfilesRepo.js';
import { getBotInstance } from '../integrations/telegram/client.js';
import { telegramConfig } from '../integrations/telegram/config.js';
import { reportOperatorFailure } from '../infra/operatorIncident/reportOperatorFailure.js';
import {
  recordOperatorOutboundProbeRun,
  resolveOpenOperatorIncidentsByDedupKeyPrefix,
} from '../infra/db/repos/operatorHealthDrizzle.js';

export type ProbeOutcome = 'ok' | 'fail' | 'skipped_not_configured';

const MAX_PROBE_TIMEOUT_MS = 15_000;
const RUBITIME_PROBE_TIMEOUT_MS = 15_000;
const TELEGRAM_PROBE_TIMEOUT_MS = 15_000;
const GOOGLE_CALENDAR_PROBE_TIMEOUT_MS = 15_000;

function withMaxProbeTimeout<T>(promise: Promise<T>, timeoutMs = MAX_PROBE_TIMEOUT_MS): Promise<T> {
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
 * Синтетические пробы MAX + Rubitime; при успехе — resolve открытых probe-инцидентов по префиксу.
 */
export async function runOperatorHealthProbes(input: {
  dispatchPort: DispatchPort;
}): Promise<OperatorHealthProbeRunResult> {
  const details: Record<string, string> = {};
  let max: ProbeOutcome = 'skipped_not_configured';
  let rubitime: ProbeOutcome = 'skipped_not_configured';
  let telegram: ProbeOutcome = 'skipped_not_configured';
  let google_calendar: ProbeOutcome = 'skipped_not_configured';

  if (maxConfig.enabled && maxConfig.apiKey.trim().length > 0) {
    const info = await withMaxProbeTimeout(getMaxBotInfo({ apiKey: maxConfig.apiKey })).catch(() => null);
    if (info === null) {
      max = 'fail';
      details.max = 'getMyInfo returned null';
      await reportOperatorFailure({
        dispatchPort: input.dispatchPort,
        direction: 'outbound',
        integration: 'max',
        errorClass: 'max_probe_failed',
        errorDetail: 'getMyInfo returned null',
        alertLines: ['MAX probe failed', 'getMyInfo returned null'],
      });
    } else {
      max = 'ok';
      details.max = 'ok';
      const n = await resolveOpenOperatorIncidentsByDedupKeyPrefix('outbound:max:');
      if (n > 0) details.maxResolved = String(n);
    }
  } else {
    details.max = 'skipped_not_configured';
  }

  const db = createDbPort();
  const triple = await pickAnyActiveRubitimeScheduleTriple(db);
  if (triple === null) {
    details.rubitime = 'no_active_booking_profile';
  } else {
    try {
      await fetchRubitimeSchedule({
        params: {
          branchId: triple.branchId,
          cooperatorId: triple.cooperatorId,
          serviceId: triple.serviceId,
        },
        fetchImpl: fetchWithTimeout(RUBITIME_PROBE_TIMEOUT_MS),
      });
      rubitime = 'ok';
      details.rubitime = 'ok';
      const n = await resolveOpenOperatorIncidentsByDedupKeyPrefix('outbound:rubitime:');
      if (n > 0) details.rubitimeResolved = String(n);
    } catch (err) {
      rubitime = 'fail';
      const msg = err instanceof Error ? err.message : String(err);
      details.rubitime = msg;
      await reportOperatorFailure({
        dispatchPort: input.dispatchPort,
        direction: 'outbound',
        integration: 'rubitime',
        errorClass: 'rubitime_get_schedule_failed',
        errorDetail: msg,
        alertLines: ['Rubitime get-schedule probe failed', msg],
      });
    }
  }

  if (telegramConfig.botToken.trim().length > 0) {
    try {
      await withMaxProbeTimeout(
        getBotInstance().api.getMe(),
        TELEGRAM_PROBE_TIMEOUT_MS,
      );
      telegram = 'ok';
      details.telegram = 'ok';
      const n = await resolveOpenOperatorIncidentsByDedupKeyPrefix('outbound:telegram:');
      if (n > 0) details.telegramResolved = String(n);
    } catch (err) {
      telegram = 'fail';
      const msg = err instanceof Error ? err.message : String(err);
      details.telegram = msg;
      await reportOperatorFailure({
        dispatchPort: input.dispatchPort,
        direction: 'outbound',
        integration: 'telegram',
        errorClass: 'telegram_probe_failed',
        errorDetail: msg,
        alertLines: ['Telegram getMe probe failed', msg],
      });
    }
  } else {
    details.telegram = 'skipped_not_configured';
  }

  try {
    const gcalConfig = await getGoogleCalendarConfig();
    if (gcalConfig.enabled && gcalConfig.refreshToken?.trim()) {
      await probeGoogleCalendarAccess(
        fetchWithTimeout(GOOGLE_CALENDAR_PROBE_TIMEOUT_MS),
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
      await reportOperatorFailure({
        dispatchPort: input.dispatchPort,
        direction: 'outbound',
        integration: 'google_calendar',
        errorClass: 'google_calendar_probe_failed',
        errorDetail: msg,
        alertLines: ['Google Calendar probe failed', msg],
      });
    }
  }

  const anyFail = max === 'fail' || rubitime === 'fail' || telegram === 'fail' || google_calendar === 'fail';
  try {
    const streak = await recordOperatorOutboundProbeRun({
      max,
      rubitime,
      telegram,
      google_calendar,
      anyFail,
    });
    details.consecutiveFailRuns = String(streak.consecutiveFailRuns);
  } catch (err) {
    logger.warn({ err }, 'operator_health_probe_job_status_failed');
  }

  logger.info({ max, rubitime, telegram, google_calendar, details }, 'operator_health_probes_done');
  return { max, rubitime, telegram, google_calendar, details };
}
