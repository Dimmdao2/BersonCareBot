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

  it('reports an isolation failure no rule recognizes as unclassified instead of dropping it', async () => {
    const isolationFailure = vi.fn(async () => {});
    const reporter = createMediaWorkerIsolationReporter({ isolationFailure }, () => 1_000);

    // A wall denial the classifier has no specific rule for: SQLSTATE 42501 with a message none of
    // the patterns match. The receiving control seam stores it; it must not vanish here.
    reporter.report(Object.assign(new Error('denied by an unnamed guard'), { code: '42501' }));
    await Promise.resolve();
    expect(isolationFailure).toHaveBeenCalledWith('unclassified_background_operation');
  });
});
