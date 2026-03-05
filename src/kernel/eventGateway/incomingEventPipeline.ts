import type { DispatchPort, DbWritePort, IncomingEvent } from '../contracts/index.js';
import { executeDomainAction, processAcceptedIncomingEvent } from '../domain/index.js';
import { dispatchIntent as dispatchIntentPipeline } from '../../runtime/dispatcher/dispatcher.js';

export type IncomingEventPipelineDeps = {
  writePort: DbWritePort;
  dispatchPort: DispatchPort;
  findTelegramUserByPhone: (phoneNormalized: string) => Promise<{
    chatId: number;
    telegramId: string;
    username: string | null;
  } | null>;
};

export function createIncomingEventPipeline(deps: IncomingEventPipelineDeps): {
  run: (event: IncomingEvent) => Promise<void>;
} {
  return {
    async run(event: IncomingEvent): Promise<void> {
      await processAcceptedIncomingEvent(event, {
        findTelegramUserByPhone: deps.findTelegramUserByPhone,
        async executeAction(action, context) {
          return executeDomainAction(action, context, { writePort: deps.writePort });
        },
        async dispatchIntent(intent) {
          await dispatchIntentPipeline(intent, [{
            canHandle: () => true,
            send: async (outgoingIntent) => deps.dispatchPort.dispatchOutgoing(outgoingIntent),
          }]);
        },
      });
    },
  };
}
