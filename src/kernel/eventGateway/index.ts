import type {
  DbWritePort,
  DispatchPort,
  EventGateway,
  GatewayResult,
  IdempotencyPort,
  IncomingEvent,
  Orchestrator,
} from '../contracts/index.js';
import { incomingEventSchema } from '../contracts/index.js';
import { buildDedupKey } from './dedup.js';
import { checkGatewayRateLimit } from './rateLimit.js';

/**
 * Зависимости eventGateway.
 * Gateway не содержит бизнес-логики: только envelope-проверки, dedup и запуск orchestrator.
 */
type EventGatewayDeps = {
  orchestrator: Orchestrator;
  writePort?: DbWritePort;
  dispatchPort?: DispatchPort;
  idempotencyPort?: IdempotencyPort;
  dedupTtlSec?: number;
};

/**
 * Создает единую входную точку обработки нормализованных событий.
 * Поток: validate -> rateLimit -> dedup -> orchestrate -> apply writes -> dispatch outgoing.
 */
export function createEventGateway(deps: EventGatewayDeps): EventGateway {
  const {
    orchestrator,
    writePort,
    dispatchPort,
    idempotencyPort,
    dedupTtlSec = 900,
  } = deps;

  return {
    /** Принимает event-конверт, выполняет dedup и запускает оркестрацию. */
    async handleIncomingEvent(event: IncomingEvent): Promise<GatewayResult> {
      incomingEventSchema.parse(event);

      const rate = await checkGatewayRateLimit(event);
      if (!rate.allowed) {
        return {
          status: 'failed',
          dedupKey: `${event.meta.source}:${event.type}:rate_limited`,
          error: rate.reason ?? 'RATE_LIMITED',
        };
      }

      const dedupKey = buildDedupKey(event);
      if (idempotencyPort) {
        const acquired = await idempotencyPort.tryAcquire(dedupKey, dedupTtlSec);
        if (!acquired) return { status: 'duplicate', dedupKey };
      }

      const result = await orchestrator.orchestrate(event);

      let writesApplied = 0;
      if (writePort) {
        for (const mutation of result.writes) {
          await writePort.writeDb(mutation);
          writesApplied += 1;
        }
      }

      let outgoingDispatched = 0;
      if (dispatchPort) {
        for (const intent of result.outgoing) {
          await dispatchPort.dispatchOutgoing(intent);
          outgoingDispatched += 1;
        }
      }

      return { status: 'processed', dedupKey, writesApplied, outgoingDispatched };
    },
  };
}
