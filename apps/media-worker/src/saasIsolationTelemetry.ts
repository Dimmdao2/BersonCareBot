import { createSaasIsolationBackgroundReporter } from '@bersoncare/db-principal';
import { createMediaWorkerSaasIsolationTelemetryPoolProvider } from './poolProvider.js';
import { runMediaWorkerPgText } from './runMediaWorkerSql.js';

export function createMediaWorkerIsolationReporter(connectionString: string) {
  const pool = createMediaWorkerSaasIsolationTelemetryPoolProvider(connectionString);
  return {
    report: createSaasIsolationBackgroundReporter({
      source: { service: 'media_worker', operation: 'media_transcode_tick' },
      // Единственный переходник к общему пакету `db-principal`: он транспортно-независим и
      // принимает форму `.query`, но исполняет за него порт.
      query: (sql, values) => runMediaWorkerPgText(pool, sql, values as unknown[]),
    }),
    close: () => pool.end(),
  };
}
