/* eslint-disable no-secrets/no-secrets -- imports reference long exported symbol names, not secrets */
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG,
  type OperatorHealthProbeConfig,
} from '../../../app/operatorHealthProbeSettings.js';
import { runScheduledOperatorHealthProbeTick } from './operatorHealthProbeTick.js';

describe('runScheduledOperatorHealthProbeTick', () => {
  it('wraps the config read, last-run read, and probe run in the scheduler infra principal', async () => {
    const principals: unknown[] = [];
    const config: OperatorHealthProbeConfig = {
      ...structuredClone(DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG),
      max: {
        ...DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG.max,
        intervalMs: 600_000,
      },
    };
    const runProbes = vi.fn(async () => {
      principals.push(getCurrentDbPrincipal());
      return {
        max: 'ok' as const,
        rubitime: 'skipped_not_configured' as const,
        telegram: 'skipped_not_configured' as const,
        google_calendar: 'skipped_not_configured' as const,
        details: {},
      };
    });

    const ran = await runScheduledOperatorHealthProbeTick({
      dispatchPort: { dispatchOutgoing: vi.fn() },
      loadConfig: vi.fn(async () => {
        principals.push(getCurrentDbPrincipal());
        return config;
      }),
      loadLastRunAt: vi.fn(async () => {
        principals.push(getCurrentDbPrincipal());
        return {
          max: '2026-07-27T11:40:00.000Z',
          telegram: '2026-07-27T11:59:00.000Z',
          rubitime: '2026-07-27T11:59:00.000Z',
          google_calendar: '2026-07-27T11:59:00.000Z',
        };
      }),
      runProbes,
      now: () => new Date('2026-07-27T12:00:00.000Z'),
    });

    expect(ran).toBe(true);
    expect(principals).toEqual([
      { kind: 'infra', source: 'scheduler:handle-tick-event' },
      { kind: 'infra', source: 'scheduler:handle-tick-event' },
      { kind: 'infra', source: 'scheduler:handle-tick-event' },
    ]);
    expect(runProbes).toHaveBeenCalledWith(expect.objectContaining({ probes: ['max'] }));
    expect(getCurrentDbPrincipal()).toBeUndefined();
  });
});
