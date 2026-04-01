import { logger } from '../../infra/observability/logger.js';
import { maxConfig } from './config.js';
import { setMaxBotCommands } from './client.js';
import { getMaxApiKey } from './runtimeConfig.js';

let setupStarted = false;

export async function setupMaxCommands(): Promise<void> {
  if (setupStarted) return;
  setupStarted = true;

  if (!maxConfig.enabled) return;
  const apiKey = await getMaxApiKey();
  if (!apiKey) return;

  const ok = await setMaxBotCommands(
    { apiKey },
    [
      { name: 'start', description: 'Главное меню' },
      { name: 'book', description: 'Записаться на прием' },
    ],
  );

  if (ok) {
    logger.info('MAX: setMyCommands ok');
    return;
  }

  logger.warn('MAX: setMyCommands failed (non-fatal)');
}
