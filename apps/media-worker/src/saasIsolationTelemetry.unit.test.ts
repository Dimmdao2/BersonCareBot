import { describe, expect, it, vi } from 'vitest';
import { createMediaWorkerIsolationReporter } from './saasIsolationTelemetry.js';

describe('media worker isolation telemetry control adapter', () => {
  it('reports only the closed isolation event class and does not let telemetry failure replace the worker failure', async () => {
    const isolationFailure = vi.fn(async () => { throw new Error('control unavailable'); });
    let now = 1_000;
    const reporter = createMediaWorkerIsolationReporter({ isolationFailure }, () => now);
    const original = Object.assign(new Error('permission denied for relation media_files'), { code: '42501' });

    reporter.report(original);
    await Promise.resolve();
    await Promise.resolve();
    expect(isolationFailure).toHaveBeenCalledWith('role_pool_mismatch');
    expect(reporter.inspectForTest().circuitOpenUntil).toBe(31_000);
    reporter.report(original);
    expect(isolationFailure).toHaveBeenCalledTimes(1);
    now = 31_001;
    reporter.report(new Error('ordinary S3 failure'));
    expect(isolationFailure).toHaveBeenCalledTimes(1);
  });
});
