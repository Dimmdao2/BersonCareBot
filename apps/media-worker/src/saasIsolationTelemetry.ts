import { createSaasIsolationBackgroundReporter } from '@bersoncare/db-principal';
import { createMediaWorkerSaasIsolationTelemetryPoolProvider } from './poolProvider.js';

export function createMediaWorkerIsolationReporter(connectionString: string) {
  const pool = createMediaWorkerSaasIsolationTelemetryPoolProvider(connectionString);
  return {
    report: createSaasIsolationBackgroundReporter({
      source: { service: 'media_worker', operation: 'media_transcode_tick' },
      query: (sql, values) => pool.query(sql, values as unknown[]),
    }),
    close: () => pool.end(),
  };
}
