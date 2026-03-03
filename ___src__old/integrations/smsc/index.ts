import type { IntegrationDescriptor } from '../types.js';

export const smscIntegration: IntegrationDescriptor = {
  id: 'smsc',
  kind: 'provider',
  capabilities: {
    supportsIncoming: false,
    supportsOutgoing: true,
  },
  supportedIncomingTypes: [],
  supportedOutgoingTypes: ['message.send'],
};
