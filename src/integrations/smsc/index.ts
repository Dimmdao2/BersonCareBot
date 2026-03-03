import type { IntegrationDescriptor } from '../types.js';

/** Descriptor SMSC-интеграции для общего реестра. */
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
