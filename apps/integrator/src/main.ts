/**
 * Точка входа рефактор-ветки: загружает env и запускает HTTP-приложение.
 * Важно: dotenv должен инициализироваться до импортов, читающих `config/env`.
 */
import './config/loadEnv.js';

/**
 * Запускает Fastify-приложение и пишет лог старта.
 * Перед стартом применяет legacy startup-миграции или выполняет locked-runtime preflight.
 */
async function start() {
  const { assertApiIsolationTelemetryWriterReady } =
    await import('./infra/observability/saasIsolationTelemetry.js');
  const { runStartupMigrationGate } = await import('./infra/db/migrate.js');
  const { createDbPort } = await import('./infra/db/client.js');
  const { buildApp } = await import('./app/index.js');
  const { env } = await import('./config/env.js');
  const { logger } = await import('./infra/observability/logger.js');
  const { initIntegratorErrorTracking, closeIntegratorErrorTracking } =
    await import('./infra/observability/errorTracking.js');
  const runtimeDb = createDbPort();

  await initIntegratorErrorTracking(runtimeDb, 'api');

  await runStartupMigrationGate();
  await assertApiIsolationTelemetryWriterReady();
  const app = await buildApp();
  await app.listen({
    port: env.PORT,
    host: env.HOST,
  });
  logger.info(`Server listening on http://${env.HOST}:${env.PORT}`);

  const stop = async (): Promise<void> => {
    try {
      await app.close();
    } finally {
      await closeIntegratorErrorTracking();
    }
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}

start().catch(async (error: unknown) => {
  const { captureIntegratorStartupFatal, closeIntegratorErrorTracking } =
    await import('./infra/observability/errorTracking.js');
  const { reportIntegratorIsolationFailure } =
    await import('./infra/observability/saasIsolationTelemetry.js');
  const { logger } = await import('./infra/observability/logger.js');
  captureIntegratorStartupFatal(error);
  reportIntegratorIsolationFailure(error);
  logger.error(error, 'Failed to start server');
  await closeIntegratorErrorTracking();
  process.exitCode = 1;
});
