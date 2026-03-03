import type { IntegrationDescriptor } from '../types.js';
import { createInboundPlaceholder, createOutboundPlaceholder } from '../template.js';

/** VK integration descriptor placeholder for connector registry. */
export const vkIntegration: IntegrationDescriptor = {
  id: 'vk',
  kind: 'messenger',
  capabilities: {
    supportsIncoming: true,
    supportsOutgoing: true,
  },
  supportedIncomingTypes: ['message.received'],
  supportedOutgoingTypes: ['message.send'],
};

/** Inbound adapter template for future VK webhook. */
export const vkInboundAdapter = createInboundPlaceholder(vkIntegration);

/** Outbound adapter template for future VK API. */
export const vkOutboundAdapter = createOutboundPlaceholder(vkIntegration);
