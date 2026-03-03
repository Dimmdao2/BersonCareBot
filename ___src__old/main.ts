// Загрузка dotenv до любого импорта, использующего config/env (см. динамические импорты ниже)
import dotenv from 'dotenv';
if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: '/opt/tgcarebot/.env' });
} else {
  dotenv.config();
}

async function start() {
  const { buildApp } = await import('./app.js');
  const { env } = await import('./config/env.js');
  const { logger } = await import('./observability/logger.js');

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
