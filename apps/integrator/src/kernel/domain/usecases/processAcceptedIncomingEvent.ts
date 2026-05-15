import type {
  Action,
  ActionResult,
  DbReadPort,
  DomainContext,
  IncomingEvent,
  IntentMeta,
  Orchestrator,
  OutgoingIntent,
} from '../../contracts/index.js';
import { handleIncomingEvent } from '../handleIncomingEvent.js';
import { logger } from '../../../infra/observability/logger.js';

type ProcessAcceptedIncomingEventDeps = {
  readPort: DbReadPort;
  executeAction: (action: Action, context: DomainContext) => Promise<ActionResult>;
  dispatchIntent: (intent: OutgoingIntent) => Promise<void>;
  orchestrator: Orchestrator;
};

/**
 * Доменная входная точка для событий, уже принятых gateway.
 * Отвечает за подготовку контекста, выбор шагов, выполнение действий и отправку intents.
 *
 * Доставка intents **best-effort по цепочке**: ошибка одного intent (например `message.edit`)
 * не блокирует следующие (например `callback.answer`), чтобы не оставлять пользователя
 * с бесконечным «loading» в Telegram/MAX.
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

  let dispatchFailureCount = 0;
  const failedIntentIndices: number[] = [];
  const failedIntentTypes: string[] = [];

  for (let i = 0; i < domainResult.intents.length; i++) {
    const intent = domainResult.intents[i];
    if (intent === undefined) continue;
    try {
      await deps.dispatchIntent(intent);
    } catch (caught) {
      dispatchFailureCount++;
      failedIntentIndices.push(i);
      failedIntentTypes.push(intent.type);
      const err = caught instanceof Error ? caught : new Error(String(caught));
      const meta: IntentMeta = intent.meta;
      logger.warn(
        {
          err,
          intentIndex: i,
          intentType: intent.type,
          eventId: meta.eventId,
          correlationId: meta.correlationId,
        },
        'processAcceptedIncomingEvent: intent dispatch failed (continuing)',
      );
    }
  }

  if (dispatchFailureCount > 0) {
    logger.warn(
      {
        dispatchFailureCount,
        intentTotal: domainResult.intents.length,
        failedIntentIndices,
        failedIntentTypes,
        eventId: event.meta.eventId,
        correlationId: event.meta.correlationId,
        source: event.meta.source,
      },
      'processAcceptedIncomingEvent: intent dispatch finished with one or more failures',
    );
  }
}
