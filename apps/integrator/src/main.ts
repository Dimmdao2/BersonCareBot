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
  const { reportIntegratorIsolationFailure } = await import('./infra/observability/saasIsolationTelemetry.js');
  const { runStartupMigrationGate } = await import('./infra/db/migrate.js');
  const { buildApp } = await import('./app/index.js');
  const { env } = await import('./config/env.js');
  const { logger } = await import('./infra/observability/logger.js');

  await runStartupMigrationGate();

  const app = await buildApp();
  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    logger.info(`Server listening on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    reportIntegratorIsolationFailure(err);
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

start();
