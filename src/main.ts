
import dotenv from 'dotenv';
if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: '/opt/tgcarebot/.env' });
} else {
  dotenv.config();
}

import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './logger.js';

async function start() {
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
