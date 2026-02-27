import type { IntegrationDescriptor } from '../types.js';

/** Descriptor Telegram-интеграции для общего реестра. */
export const telegramIntegration: IntegrationDescriptor = {
  id: 'telegram',
  kind: 'messenger',
  capabilities: {
    supportsIncoming: true,
    supportsOutgoing: true,
  },
  supportedIncomingTypes: ['message.received', 'callback.received'],
  supportedOutgoingTypes: ['message.send'],
};
