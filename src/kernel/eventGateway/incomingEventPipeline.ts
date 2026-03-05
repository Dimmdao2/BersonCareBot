import type { DbReadPort, DispatchPort, DbWritePort, IncomingEvent, QueuePort } from '../contracts/index.js';
import { executeDomainAction, processAcceptedIncomingEvent } from '../domain/index.js';

export type IncomingEventPipelineDeps = {
  readPort: DbReadPort;
  writePort: DbWritePort;
  queuePort: QueuePort;
  dispatchPort: DispatchPort;
};

export function createIncomingEventPipeline(deps: IncomingEventPipelineDeps): {
  run: (event: IncomingEvent) => Promise<void>;
} {
  return {
    async run(event: IncomingEvent): Promise<void> {
      await processAcceptedIncomingEvent(event, {
        readPort: deps.readPort,
        async executeAction(action, context) {
          return executeDomainAction(action, context, {
            readPort: deps.readPort,
            writePort: deps.writePort,
            queuePort: deps.queuePort,
          });
        },
        async dispatchIntent(intent) {
          await deps.dispatchPort.dispatchOutgoing(intent);
        },
      });
    },
  };
}
