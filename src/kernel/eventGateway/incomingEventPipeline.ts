import type { DbReadPort, DispatchPort, DbWritePort, IncomingEvent, Orchestrator, QueuePort, TemplatePort } from '../contracts/index.js';
import { executeDomainAction, processAcceptedIncomingEvent } from '../domain/index.js';

export type IncomingEventPipelineDeps = {
  readPort: DbReadPort;
  writePort: DbWritePort;
  queuePort: QueuePort;
  dispatchPort: DispatchPort;
  orchestrator: Orchestrator;
  templatePort: TemplatePort;
};

export function createIncomingEventPipeline(deps: IncomingEventPipelineDeps): {
  run: (event: IncomingEvent) => Promise<void>;
} {
  return {
    async run(event: IncomingEvent): Promise<void> {
      await processAcceptedIncomingEvent(event, {
        readPort: deps.readPort,
        orchestrator: deps.orchestrator,
        async executeAction(action, context) {
          return executeDomainAction(action, context, {
            readPort: deps.readPort,
            writePort: deps.writePort,
            queuePort: deps.queuePort,
            templatePort: deps.templatePort,
          });
        },
        async dispatchIntent(intent) {
          await deps.dispatchPort.dispatchOutgoing(intent);
        },
      });
    },
  };
}
