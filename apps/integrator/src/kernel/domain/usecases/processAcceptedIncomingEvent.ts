import type {
  Action,
  ActionResult,
  DbPort,
  DbReadPort,
  DomainContext,
  IncomingEvent,
  IntentMeta,
  Orchestrator,
  OutgoingIntent,
} from '../../contracts/index.js';
import { handleIncomingEvent } from '../handleIncomingEvent.js';
import { logger } from '../../../infra/observability/logger.js';
import { enqueueOutgoingDeliveryIfAbsent } from '../../../infra/db/repos/outgoingDeliveryQueue.js';
import {
  INBOUND_REPLY_DELIVERY_MAX_ATTEMPTS,
  INBOUND_REPLY_QUEUE_KIND,
} from '../../../infra/delivery/deliveryContract.js';

type ProcessAcceptedIncomingEventDeps = {
  readPort: DbReadPort;
  /**
   * D35: нужен только для постановки провалившегося ответа в `outgoing_delivery_queue`
   * (см. `enqueueFailedReplyForRetry`). Без него провал по-прежнему best-effort и виден только в
   * логе — как раньше.
   */
  db?: DbPort;
  executeAction: (action: Action, context: DomainContext) => Promise<ActionResult>;
  dispatchIntent: (intent: OutgoingIntent) => Promise<void>;
  orchestrator: Orchestrator;
};

/**
 * D35 п.4: подтверждение нажатия кнопки. Дедлайн истёк в момент отказа (мессенджер уже показал
 * человеку крутилку) — ретраить нечего, ставить в очередь нельзя (аналог Sidekiq `retry: false`).
 */
const ACK_INTENT_TYPES: ReadonlySet<OutgoingIntent['type']> = new Set(['callback.answer']);

/** D35: очередь понимает только каналы-мессенджеры (см. `handleDispatchFailure`'s bot-blocked gate). */
function isQueueableReplyChannel(source: string): source is 'telegram' | 'max' {
  return source === 'telegram' || source === 'max';
}

/**
 * D35 п.3+п.5: провалившийся ответ на входящее — единственный путь, где человек ждёт прямо
 * сейчас, — ставится в durable-очередь на короткой лестнице (`INBOUND_REPLY_QUEUE_KIND`) вместо
 * того, чтобы остаться только строкой в логе. Дальше судьбу строки решает воркер
 * (`outgoingDeliveryWorker.ts`): постоянный отказ (бот заблокирован) — без ретрая и без инцидента;
 * временный, исчерпавший короткую лестницу, — инцидент оператора. `enqueueOutgoingDeliveryIfAbsent`
 * идемпотентен по `eventId`, повторная постановка того же провала дубля не создаст.
 */
async function enqueueFailedReplyForRetry(
  db: DbPort,
  intent: OutgoingIntent,
  intentIndex: number,
): Promise<boolean> {
  return enqueueOutgoingDeliveryIfAbsent(db, {
    eventId: `${intent.meta.eventId}:queued:${intentIndex}`,
    kind: INBOUND_REPLY_QUEUE_KIND,
    channel: intent.meta.source,
    payloadJson: { intent },
    maxAttempts: INBOUND_REPLY_DELIVERY_MAX_ATTEMPTS,
  });
}

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

      let queuedForRetry = false;
      if (deps.db && !ACK_INTENT_TYPES.has(intent.type) && isQueueableReplyChannel(meta.source)) {
        try {
          queuedForRetry = await enqueueFailedReplyForRetry(deps.db, intent, i);
        } catch (queueErr) {
          logger.error(
            {
              err: queueErr,
              intentIndex: i,
              intentType: intent.type,
              eventId: meta.eventId,
              correlationId: meta.correlationId,
            },
            'processAcceptedIncomingEvent: failed to enqueue reply retry',
          );
        }
      }

      logger.warn(
        {
          err,
          intentIndex: i,
          intentType: intent.type,
          eventId: meta.eventId,
          correlationId: meta.correlationId,
          queuedForRetry,
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
