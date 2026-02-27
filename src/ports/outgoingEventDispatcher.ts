import type { OutgoingEvent } from '../domain/contracts/index.js';

export type MessageByPhoneInput = {
  phoneNormalized: string;
  messageText: string;
  smsFallbackText: string;
  correlationId?: string;
};

export type OutgoingEventDispatcher = {
  dispatchOutgoing(event: OutgoingEvent): Promise<void>;
};

export function createOutgoingEventDispatcher(deps: {
  dispatchMessageByPhone?: (input: MessageByPhoneInput) => Promise<void>;
  dispatchTelegramOutgoingEvent?: (event: OutgoingEvent) => Promise<void>;
}): OutgoingEventDispatcher {
  const { dispatchMessageByPhone, dispatchTelegramOutgoingEvent } = deps;

  return {
    async dispatchOutgoing(event) {
      if (event.type !== 'message.send') return;

      if (event.meta.source === 'telegram') {
        if (!dispatchTelegramOutgoingEvent) return;
        await dispatchTelegramOutgoingEvent(event);
        return;
      }

      if (event.meta.source !== 'rubitime' || !dispatchMessageByPhone) return;
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
