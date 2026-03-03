import type { IntegrationDescriptor } from '../types.js';
import { createInboundPlaceholder, createOutboundPlaceholder } from '../template.js';

/** Instagram integration descriptor placeholder for connector registry. */
export const instagramIntegration: IntegrationDescriptor = {
  id: 'instagram',
  kind: 'messenger',
  capabilities: {
    supportsIncoming: true,
    supportsOutgoing: true,
  },
  supportedIncomingTypes: ['message.received'],
  supportedOutgoingTypes: ['message.send'],
};

/** Inbound adapter template for future Instagram webhook. */
export const instagramInboundAdapter = createInboundPlaceholder(instagramIntegration);

/** Outbound adapter template for future Instagram API. */
export const instagramOutboundAdapter = createOutboundPlaceholder(instagramIntegration);
