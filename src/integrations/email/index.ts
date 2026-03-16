import type { IntegrationDescriptor } from '../types.js';
import { createInboundPlaceholder, createOutboundPlaceholder } from '../template.js';

/** Email integration descriptor placeholder for connector registry. */
export const emailIntegration: IntegrationDescriptor = {
  id: 'email',
  kind: 'provider',
  capabilities: {
    supportsIncoming: false,
    supportsOutgoing: true,
  },
  supportedIncomingTypes: [],
  supportedOutgoingTypes: ['message.send'],
};

/** Outbound adapter template for future email provider wiring. */
export const emailOutboundAdapter = createOutboundPlaceholder(emailIntegration);

/** Inbound adapter placeholder (not used for email by default). */
export const emailInboundAdapter = createInboundPlaceholder(emailIntegration);

export { sendMail, isMailerConfigured } from './mailer.js';
export type { SendMailParams, SendMailResult } from './mailer.js';
export { emailConfig } from './config.js';
