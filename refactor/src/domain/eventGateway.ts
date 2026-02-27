import type { EventGateway, IncomingEvent, Orchestrator, OutgoingDispatcher, DbWritePort } from './contracts/index.js';
import { incomingEventSchema } from './contracts/index.js';

/**
 * Зависимости eventGateway.
 * Gateway не содержит бизнес-логики: только валидация envelope и передача в orchestrator.
 */
type EventGatewayDeps = {
  orchestrator: Orchestrator;
  writePort?: DbWritePort;
  outgoingDispatcher?: OutgoingDispatcher;
};

/**
 * Создает единую входную точку обработки нормализованных событий.
 * Поток: validate -> orchestrate -> apply writes -> dispatch outgoing.
 */
export function createEventGateway(deps: EventGatewayDeps): EventGateway {
  const { orchestrator, writePort, outgoingDispatcher } = deps;

  return {
    /** Принимает входящий event-конверт и запускает обработку через orchestrator. */
    async handleIncomingEvent(event: IncomingEvent): Promise<void> {
      incomingEventSchema.parse(event);

      const result = await orchestrator.orchestrate(event);

      if (writePort) {
        for (const mutation of result.writes) {
          await writePort.writeDb(mutation);
        }
      }

      if (outgoingDispatcher) {
        for (const outgoing of result.outgoing) {
          await outgoingDispatcher.dispatchOutgoing(outgoing);
        }
      }
    },
  };
}
