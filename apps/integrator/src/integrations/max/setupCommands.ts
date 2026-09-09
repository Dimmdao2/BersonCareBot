import { logger } from '../../infra/observability/logger.js';
import { setMaxBotCommands } from './client.js';
import { getMaxRuntimeConfig } from '../../infra/adapters/integrationRuntimeConfig.js';
import type { PlatformDeliveryAudience } from '../../infra/adapters/platformDeliveryAudience.js';

const setupStarted = new Set<PlatformDeliveryAudience>();

export async function setupMaxCommands(
  audience: PlatformDeliveryAudience = 'patient',
): Promise<void> {
  if (setupStarted.has(audience)) return;
  setupStarted.add(audience);

  const config = await getMaxRuntimeConfig(audience);
  if (!config.enabled) return;
  /** Пустой список — убираем slash-команды из меню клиента MAX; навигация через инлайн-кнопки. */
  const ok = await setMaxBotCommands({ apiKey: config.apiKey, baseUrl: config.baseUrl }, []);

  if (ok) {
    logger.info('MAX: setMyCommands ok (empty command list)');
    return;
  }

  logger.warn('MAX: setMyCommands failed (non-fatal)');
}
