import type { IntegrationDescriptor } from './types.js';
import { rubitimeIntegration } from './rubitime/index.js';
import { smscIntegration } from './smsc/index.js';
import { telegramIntegration } from './telegram/index.js';

/**
 * Реестр интеграций, подключенных в текущей сборке.
 * Используется для диагностики и отображения capabilities при старте приложения.
 */
export const integrationRegistry: IntegrationDescriptor[] = [
  telegramIntegration,
  rubitimeIntegration,
  smscIntegration,
];
