import type { IntegrationDescriptor } from '../types.js';

/** Descriptor Rubitime-интеграции для общего реестра. */
export const rubitimeIntegration: IntegrationDescriptor = {
  id: 'rubitime',
  kind: 'system',
  capabilities: {
    supportsIncoming: true,
    supportsOutgoing: true,
  },
  supportedIncomingTypes: ['webhook.received'],
  supportedOutgoingTypes: ['booking.changed', 'integration.sync'],
};
