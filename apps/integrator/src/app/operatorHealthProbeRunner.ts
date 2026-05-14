import type { DispatchPort } from '../kernel/contracts/index.js';
import { logger } from '../infra/observability/logger.js';
import { createDbPort } from '../infra/db/client.js';
import { getMaxBotInfo } from '../integrations/max/client.js';
import { maxConfig } from '../integrations/max/config.js';
import { fetchRubitimeSchedule } from '../integrations/rubitime/client.js';
import { pickAnyActiveRubitimeScheduleTriple } from '../integrations/rubitime/db/bookingProfilesRepo.js';
import { reportOperatorFailure } from '../infra/operatorIncident/reportOperatorFailure.js';
import { resolveOpenOperatorIncidentsByDedupKeyPrefix } from '../infra/db/repos/operatorHealthDrizzle.js';

export type ProbeOutcome = 'ok' | 'fail' | 'skipped_not_configured';

const RUBITIME_PROBE_TIMEOUT_MS = 15_000;

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

  if (maxConfig.enabled && maxConfig.apiKey.trim().length > 0) {
    const info = await getMaxBotInfo({ apiKey: maxConfig.apiKey });
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

  logger.info({ max, rubitime, details }, 'operator_health_probes_done');
  return { max, rubitime, details };
}
