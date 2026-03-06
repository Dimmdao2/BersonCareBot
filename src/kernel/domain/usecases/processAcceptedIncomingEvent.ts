import type {
  Action,
  ActionResult,
  DbReadPort,
  DomainContext,
  IncomingEvent,
  Orchestrator,
  OutgoingIntent,
} from '../../contracts/index.js';
import { handleIncomingEvent } from '../handleIncomingEvent.js';

type ProcessAcceptedIncomingEventDeps = {
  readPort: DbReadPort;
  executeAction: (action: Action, context: DomainContext) => Promise<ActionResult>;
  dispatchIntent: (intent: OutgoingIntent) => Promise<void>;
  orchestrator: Orchestrator;
};

/**
 * Доменная входная точка для событий, уже принятых gateway.
 * Отвечает за подготовку контекста, выбор шагов, выполнение действий и отправку intents.
 */
export async function processAcceptedIncomingEvent(
  event: IncomingEvent,
  deps: ProcessAcceptedIncomingEventDeps,
): Promise<void> {
  const domainResult = await handleIncomingEvent(event, {
    readPort: deps.readPort,
    buildPlan: (input) => deps.orchestrator.buildPlan(input),
    async executeAction(action, context) {
      return deps.executeAction(action, context);
    },
  });

  for (const intent of domainResult.intents) {
    await deps.dispatchIntent(intent);
  }
}
