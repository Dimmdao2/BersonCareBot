import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG,
  type OperatorHealthProbeConfig,
} from '../../../app/operatorHealthProbeSettings.js';
import { runScheduledOperatorHealthProbeTick } from './operatorHealthProbeTick.js';

const NOW = new Date('2026-08-03T10:00:00.000Z');

function config(
  patch: Partial<OperatorHealthProbeConfig> = {},
): OperatorHealthProbeConfig {
  return {
    ...DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG,
    ...patch,
  };
}

function deps(input: {
  probeConfig?: OperatorHealthProbeConfig;
  lastRunAt?: Record<string, string | null>;
}) {
  const runProbes = vi.fn(async () => ({
    max: 'ok' as const,
    telegram: 'ok' as const,
    google_calendar: 'ok' as const,
    details: {},
  }));
  return {
    runProbes,
    value: {
      dispatchPort: { dispatchOutgoing: vi.fn() },
      loadConfig: vi.fn(async () => input.probeConfig ?? config()),
      loadLastRunAt: vi.fn(async () => input.lastRunAt ?? {}),
      runProbes,
      now: () => NOW,
    },
  };
}

describe('scheduled operator health due gate', () => {
  it('runs only probes whose individual interval is due', async () => {
    const h = deps({
      lastRunAt: {
        max: '2026-08-03T09:49:59.999Z',
        telegram: '2026-08-03T09:55:00.001Z',
        google_calendar: '2026-08-03T09:50:00.000Z',
      },
    });

    await expect(runScheduledOperatorHealthProbeTick(h.value)).resolves.toBe(true);
    expect(h.runProbes).toHaveBeenCalledWith(
      expect.objectContaining({ probes: ['max', 'google_calendar'] }),
    );
  });

  it('does nothing when every enabled probe is not due', async () => {
    const h = deps({
      lastRunAt: {
        max: '2026-08-03T09:55:00.001Z',
        telegram: '2026-08-03T09:55:00.001Z',
        google_calendar: '2026-08-03T09:55:00.001Z',
      },
    });

    await expect(runScheduledOperatorHealthProbeTick(h.value)).resolves.toBe(false);
    expect(h.runProbes).not.toHaveBeenCalled();
  });

  it('excludes disabled probes even when they have never run', async () => {
    const h = deps({
      probeConfig: config({ max: { ...config().max, enabled: false } }),
      lastRunAt: {
        max: null,
        telegram: '2026-08-03T09:55:00.001Z',
        google_calendar: '2026-08-03T09:55:00.001Z',
      },
    });

    await expect(runScheduledOperatorHealthProbeTick(h.value)).resolves.toBe(false);
    expect(h.runProbes).not.toHaveBeenCalled();
  });

  it('does not read last-run state or call providers during a bounded quiet window', async () => {
    const h = deps({ probeConfig: config({ quietUntil: '2026-08-03T11:00:00.000Z' }) });

    await expect(runScheduledOperatorHealthProbeTick(h.value)).resolves.toBe(false);
    expect(h.value.loadLastRunAt).not.toHaveBeenCalled();
    expect(h.runProbes).not.toHaveBeenCalled();
  });

  it('treats an invalid persisted lastRunAt as due instead of freezing the probe', async () => {
    const h = deps({
      lastRunAt: {
        max: 'not-a-date',
        telegram: '2026-08-03T09:55:00.001Z',
        google_calendar: '2026-08-03T09:55:00.001Z',
      },
    });

    await expect(runScheduledOperatorHealthProbeTick(h.value)).resolves.toBe(true);
    expect(h.runProbes).toHaveBeenCalledWith(expect.objectContaining({ probes: ['max'] }));
  });
});
