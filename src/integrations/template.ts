import type { IncomingEvent, OutgoingIntent } from '../kernel/contracts/index.js';
import type { IntegrationDescriptor } from './types.js';

/** Common inbound adapter contract for future integrations. */
export type InboundAdapter = {
  descriptor: IntegrationDescriptor;
  mapIncoming(raw: unknown): IncomingEvent | null;
};

/** Common outbound adapter contract for future integrations. */
export type OutboundAdapter = {
  descriptor: IntegrationDescriptor;
  dispatchOutgoing(intent: OutgoingIntent): Promise<'dispatched' | 'skipped'>;
};

/**
 * Builds no-op inbound adapter placeholder.
 * Used to keep connector shape stable before real SDK wiring.
 */
export function createInboundPlaceholder(descriptor: IntegrationDescriptor): InboundAdapter {
  return {
    descriptor,
    mapIncoming(_raw: unknown): IncomingEvent | null {
      return null;
    },
  };
}

/**
 * Builds no-op outbound adapter placeholder.
 * Used to keep connector shape stable before real SDK wiring.
 */
export function createOutboundPlaceholder(descriptor: IntegrationDescriptor): OutboundAdapter {
  return {
    descriptor,
    async dispatchOutgoing(_intent: OutgoingIntent): Promise<'dispatched' | 'skipped'> {
      return 'skipped';
    },
  };
}
