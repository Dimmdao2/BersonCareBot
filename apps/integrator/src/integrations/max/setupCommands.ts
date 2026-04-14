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

  /** Пустой список — убираем slash-команды из меню клиента MAX; навигация через инлайн-кнопки. */
  const ok = await setMaxBotCommands({ apiKey }, []);

  if (ok) {
    logger.info('MAX: setMyCommands ok (empty command list)');
    return;
  }

  logger.warn('MAX: setMyCommands failed (non-fatal)');
}
