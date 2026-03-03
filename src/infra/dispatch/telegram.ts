import type { DispatchPort, OutgoingIntent } from '../../kernel/contracts/index.js';

/** Telegram dispatch adapter placeholder for V2 infra layer. */
export function createTelegramDispatchPort(deps: {
  sendTelegramIntent: (intent: OutgoingIntent) => Promise<void>;
}): DispatchPort {
  return {
    async dispatchOutgoing(intent: OutgoingIntent): Promise<void> {
      if (intent.type !== 'message.send') return;
      await deps.sendTelegramIntent(intent);
    },
  };
}
