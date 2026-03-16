import type { IntegrationDescriptor } from '../types.js';

/** Max integration descriptor for connector registry. */
export const maxIntegration: IntegrationDescriptor = {
  id: 'max',
  kind: 'messenger',
  capabilities: {
    supportsIncoming: true,
    supportsOutgoing: true,
  },
  supportedIncomingTypes: ['message.received', 'callback.received'],
  supportedOutgoingTypes: ['message.send', 'callback.answer'],
};
