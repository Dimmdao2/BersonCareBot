import type { IntegrationDescriptor } from './types.js';
import { rubitimeIntegration } from './rubitime/index.js';
import { smscIntegration } from './smsc/index.js';
import { telegramIntegration } from './telegram/index.js';

export const integrationRegistry: IntegrationDescriptor[] = [
  telegramIntegration,
  rubitimeIntegration,
  smscIntegration,
];
