import { createSaasIsolationBackgroundReporter } from '@bersoncare/db-principal';
import { describe, expect, it, vi } from 'vitest';
import { probeSaasIsolationTelemetryWriter } from './saasIsolationTelemetry.js';

const source = { service: 'worker', operation: 'worker_queue_drain' } as const;

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('SaaS isolation telemetry transport', () => {
  it('exposes bounded redacted failure/drop counters when persistence fails', async () => {
    const statuses: unknown[] = [];
    const query = vi.fn(async () => {
      throw new Error('raw secret-shaped transport detail');
    });
    const reporter = createSaasIsolationBackgroundReporter({
      source,
      query,
      now: () => 1_000,
      onStatus: (status) => statuses.push(status),
    });

    reporter(new Error('principal context is required for patient 123'));
    await flush();
    reporter(new Error('principal context is required for patient 456'));

    expect(query).toHaveBeenCalledTimes(1);
    expect(reporter.inspectTransportStatus()).toEqual({
      state: 'degraded',
      queueLength: 0,
      acceptedEvents: 1,
      persistedEvents: 0,
      transportFailures: 1,
      droppedCircuitOpen: 1,
      droppedQueueFull: 0,
      probeAttempts: 0,
      probeFailures: 0,
      circuitOpen: true,
    });
    expect(JSON.stringify(statuses)).not.toMatch(/secret-shaped|patient 123|patient 456/);
  });

  it('makes a writer probe observable and clears a transient circuit only after success', async () => {
    let probeFails = true;
    const statuses: unknown[] = [];
    const reporter = createSaasIsolationBackgroundReporter({
      source,
      query: vi.fn(async () => undefined),
      probe: vi.fn(async () => {
        if (probeFails) throw new Error('credential material must not escape');
      }),
      now: () => 2_000,
      onStatus: (status) => statuses.push(status),
    });

    await expect(reporter.probeWriter()).resolves.toBe(false);
    expect(reporter.inspectTransportStatus()).toMatchObject({
      state: 'degraded', probeAttempts: 1, probeFailures: 1, transportFailures: 1, circuitOpen: true,
    });

    probeFails = false;
    await expect(reporter.probeWriter()).resolves.toBe(true);
    expect(reporter.inspectTransportStatus()).toMatchObject({
      state: 'ready', probeAttempts: 2, probeFailures: 1, transportFailures: 1, circuitOpen: false,
    });
    expect(JSON.stringify(statuses)).not.toContain('credential material');
  });

  it('probes the real writer call inside a transaction and always rolls it back', async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const pool = { connect: vi.fn(async () => ({ query, release })) };

    await expect(probeSaasIsolationTelemetryWriter(pool as never, source)).resolves.toBeUndefined();

    expect(query.mock.calls).toEqual([
      ['BEGIN'],
      ['SELECT app.report_saas_isolation_event($1, $2, $3, $4)', [
        // eslint-disable-next-line no-secrets/no-secrets -- closed telemetry enum, not credential material
        'unclassified_background_operation', 'worker', 'worker_queue_drain', 'explained',
      ]],
      ['ROLLBACK'],
    ]);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it('fails the writer probe with a generic error and destroys the failed client', async () => {
    const release = vi.fn();
    const rawFailure = new Error('password=must-not-escape');
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('report_saas_isolation_event')) throw rawFailure;
      return { rows: [], rowCount: 0 };
    });
    const pool = { connect: vi.fn(async () => ({ query, release })) };

    await expect(probeSaasIsolationTelemetryWriter(pool as never, source))
      .rejects.toThrow('saas_isolation_telemetry_writer_probe_failed');
    expect(query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
    expect(release).toHaveBeenCalledWith(rawFailure);
  });
});
