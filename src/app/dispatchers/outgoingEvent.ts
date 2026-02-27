import type { OutgoingEvent } from '../../domain/contracts/index.js';
import type { MessageByPhoneInput } from './messageByPhone.js';

export type OutgoingEventDispatcher = {
  dispatchOutgoing(event: OutgoingEvent): Promise<void>;
};

export function createOutgoingEventDispatcher(deps: {
  dispatchMessageByPhone: (input: MessageByPhoneInput) => Promise<void>;
}): OutgoingEventDispatcher {
  const { dispatchMessageByPhone } = deps;

  return {
    async dispatchOutgoing(event) {
      if (event.type !== 'message.send' || event.meta.source !== 'rubitime') return;
      const payload = event.payload as {
        recipient?: { phoneNormalized?: string };
        message?: { text?: string };
        fallback?: { smsText?: string };
      };

      await dispatchMessageByPhone({
        phoneNormalized: payload.recipient?.phoneNormalized ?? '',
        messageText: payload.message?.text ?? '',
        smsFallbackText: payload.fallback?.smsText ?? '',
        ...(event.meta.correlationId ? { correlationId: event.meta.correlationId } : {}),
      });
    },
  };
}
