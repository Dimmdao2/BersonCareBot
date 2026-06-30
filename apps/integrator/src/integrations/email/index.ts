import type { IntegrationDescriptor } from '../types.js';
import { createInboundPlaceholder, createOutboundPlaceholder } from '../template.js';

/**
 * Email descriptor for registry/diagnostics.
 * Outgoing is wired into the dispatch pipeline via EmailDeliveryAdapter (PLAN S8).
 */
export const emailIntegration: IntegrationDescriptor = {
  id: 'email',
  kind: 'provider',
  capabilities: {
    supportsIncoming: false,
    supportsOutgoing: true,
  },
  supportedIncomingTypes: [],
  supportedOutgoingTypes: [],
};

/** Placeholder outbound adapter (registry/diagnostics only; real sending is via createEmailDeliveryAdapter). */
export const emailOutboundAdapter = createOutboundPlaceholder(emailIntegration);

/** Inbound adapter placeholder (not used for email). */
export const emailInboundAdapter = createInboundPlaceholder(emailIntegration);

export { sendMail, isResolvedMailerConfigured } from './mailer.js';
export type { SendMailParams, SendMailResult } from './mailer.js';
export type { ResolvedSmtpOutboundConfig } from '../../config/smtpOutbound.js';
export { emailConfig } from './config.js';
export { createEmailDeliveryAdapter } from './deliveryAdapter.js';
