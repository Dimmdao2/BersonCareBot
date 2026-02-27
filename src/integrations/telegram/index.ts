import type { IntegrationDescriptor } from '../types.js';

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
