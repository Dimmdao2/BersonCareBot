import type { IntegrationDescriptor } from './types.js';
import { emailIntegration } from './email/index.js';
import { maxIntegration } from './max/index.js';
import { smscIntegration } from './smsc/index.js';
import { telegramIntegration } from './telegram/index.js';
import { vkIntegration } from './vk/index.js';

/**
 * Реестр интеграций, подключенных в текущей сборке.
 * Используется для диагностики и отображения capabilities при старте приложения.
 */
export const integrationRegistry: IntegrationDescriptor[] = [
  telegramIntegration,
  smscIntegration,
  vkIntegration,
  maxIntegration,
  emailIntegration,
];
