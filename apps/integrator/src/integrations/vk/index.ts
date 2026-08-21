import type { IntegrationDescriptor } from '../types.js';

/** VK community messenger, backed by Callback API and messages.* methods. */
export const vkIntegration: IntegrationDescriptor = {
  id: 'vk',
  kind: 'messenger',
  capabilities: {
    supportsIncoming: true,
    supportsOutgoing: true,
  },
  supportedIncomingTypes: ['message.received', 'callback.received'],
  supportedOutgoingTypes: ['message.send', 'callback.answer'],
};
