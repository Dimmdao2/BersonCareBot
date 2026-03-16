import type { IntegrationDescriptor } from '../types.js';
import { createInboundPlaceholder, createOutboundPlaceholder } from '../template.js';

/**
 * Email descriptor for registry/diagnostics.
 * Outgoing is false: sendMail is a utility only; email is not wired into the shared dispatch pipeline.
 */
export const emailIntegration: IntegrationDescriptor = {
  id: 'email',
  kind: 'provider',
  capabilities: {
    supportsIncoming: false,
    supportsOutgoing: false,
  },
  supportedIncomingTypes: [],
  supportedOutgoingTypes: [],
};

/** Placeholder outbound adapter; real email sending is via sendMail() utility, not the dispatch pipeline. */
export const emailOutboundAdapter = createOutboundPlaceholder(emailIntegration);

/** Inbound adapter placeholder (not used for email). */
export const emailInboundAdapter = createInboundPlaceholder(emailIntegration);

export { sendMail, isMailerConfigured } from './mailer.js';
export type { SendMailParams, SendMailResult } from './mailer.js';
export { emailConfig } from './config.js';
