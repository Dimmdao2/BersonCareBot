import type { DispatchPort } from '../../../kernel/contracts/index.js';
import type {
  OperatorHealthProbeConfig,
  OperatorHealthProbeName,
} from '../../../app/operatorHealthProbeSettings.js';
import {
  OPERATOR_HEALTH_PROBE_NAMES,
  isOperatorHealthProbeDue,
  isOperatorHealthProbeQuiet,
} from '../../../app/operatorHealthProbeSettings.js';
import type { OperatorHealthProbeRunResult } from '../../../app/operatorHealthProbeRunner.js';
import { runWithInfraPrincipal } from '../../principal/organizationPrincipal.js';

export type ScheduledOperatorHealthProbeDeps = {
  dispatchPort: DispatchPort;
  loadConfig: () => Promise<OperatorHealthProbeConfig>;
  loadLastRunAt: () => Promise<Record<string, string | null>>;
  runProbes: (input: {
    dispatchPort: DispatchPort;
    config: OperatorHealthProbeConfig;
    probes: readonly OperatorHealthProbeName[];
  }) => Promise<OperatorHealthProbeRunResult>;
  now?: () => Date;
};

/**
 * Global operator probes are scheduler infrastructure work. Keep every DB-backed step under
 * the scheduler infra principal so locked-mode checkout can select its operational DB role.
 */
export async function runScheduledOperatorHealthProbeTick(
  deps: ScheduledOperatorHealthProbeDeps,
): Promise<boolean> {
  return runWithInfraPrincipal({ source: 'scheduler:handle-tick-event' }, async () => {
    const config = await deps.loadConfig();
    const now = deps.now?.() ?? new Date();
    if (isOperatorHealthProbeQuiet(config, now)) return false;

    const lastRunAt = await deps.loadLastRunAt();
    const due = OPERATOR_HEALTH_PROBE_NAMES.filter(
      (name) =>
        config[name].enabled &&
        isOperatorHealthProbeDue({
          lastRunAt: lastRunAt[name] ?? null,
          intervalMs: config[name].intervalMs,
          now,
        }),
    );
    if (due.length === 0) return false;

    await deps.runProbes({
      dispatchPort: deps.dispatchPort,
      config,
      probes: due,
    });
    return true;
  });
}
