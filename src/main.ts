/**
 * Точка входа рефактор-ветки: загружает env и запускает HTTP-приложение.
 * Важно: dotenv должен инициализироваться до импортов, читающих `config/env`.
 */
import './config/loadEnv.js';

/**
 * Запускает Fastify-приложение и пишет лог старта.
 * При ошибке завершает процесс с кодом 1.
 */
async function start() {
  const { buildApp } = await import('./app/index.js');
  const { env } = await import('./config/env.js');
  const { logger } = await import('./infra/observability/logger.js');

  const app = buildApp();
  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    logger.info(`Server listening on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

start();
