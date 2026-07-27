import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG,
  isOperatorHealthProbeDue,
  isOperatorHealthProbeQuiet,
} from './operatorHealthProbeSettings.js';

describe('operator health probe settings', () => {
  it('uses 5 second API timeouts, ten-minute intervals, and second-failure alerts by default', () => {
    expect(DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG.max).toMatchObject({ timeoutMs: 5_000, intervalMs: 600_000, consecutiveFailures: 2 });
    expect(DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG.quietWindowMaxDurationMs).toBe(86_400_000);
  });

  it('honours the quiet window and per-probe due interval', () => {
    const now = new Date('2026-07-27T12:00:00.000Z');
    expect(isOperatorHealthProbeQuiet({ ...DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG, quietUntil: '2026-07-27T12:01:00.000Z' }, now)).toBe(true);
    expect(isOperatorHealthProbeQuiet({ ...DEFAULT_OPERATOR_HEALTH_PROBE_CONFIG, quietUntil: '9999-12-31T23:59:59.000Z' }, now)).toBe(false);
    expect(isOperatorHealthProbeDue({ lastRunAt: '2026-07-27T11:55:00.000Z', intervalMs: 600_000, now })).toBe(false);
    expect(isOperatorHealthProbeDue({ lastRunAt: '2026-07-27T11:50:00.000Z', intervalMs: 600_000, now })).toBe(true);
  });
});
