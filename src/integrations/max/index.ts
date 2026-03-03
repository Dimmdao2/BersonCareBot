import type { IntegrationDescriptor } from '../types.js';
import { createInboundPlaceholder, createOutboundPlaceholder } from '../template.js';

/** Max integration descriptor placeholder for connector registry. */
export const maxIntegration: IntegrationDescriptor = {
  id: 'max',
  kind: 'messenger',
  capabilities: {
    supportsIncoming: true,
    supportsOutgoing: true,
  },
  supportedIncomingTypes: ['message.received'],
  supportedOutgoingTypes: ['message.send'],
};

/** Inbound adapter template for future Max webhook. */
export const maxInboundAdapter = createInboundPlaceholder(maxIntegration);

/** Outbound adapter template for future Max API. */
export const maxOutboundAdapter = createOutboundPlaceholder(maxIntegration);
