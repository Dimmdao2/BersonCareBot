import { logger } from '../../infra/observability/logger.js';
import { setMaxBotCommands } from './client.js';
import { getMaxRuntimeConfig } from '../../infra/adapters/integrationRuntimeConfig.js';

let setupStarted = false;

export async function setupMaxCommands(): Promise<void> {
  if (setupStarted) return;
  setupStarted = true;

  const config = await getMaxRuntimeConfig();
  if (!config.enabled) return;
  /** Пустой список — убираем slash-команды из меню клиента MAX; навигация через инлайн-кнопки. */
  const ok = await setMaxBotCommands({ apiKey: config.apiKey, baseUrl: config.baseUrl }, []);

  if (ok) {
    logger.info('MAX: setMyCommands ok (empty command list)');
    return;
  }

  logger.warn('MAX: setMyCommands failed (non-fatal)');
}
