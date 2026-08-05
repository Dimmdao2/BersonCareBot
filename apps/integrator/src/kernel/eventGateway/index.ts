import type {
  EventGateway,
  GatewayResult,
  IdempotencyPort,
  IncomingEvent,
} from '../contracts/index.js';
import { incomingEventSchema } from '../contracts/index.js';
import { buildDedupKey } from './dedup.js';
import { checkGatewayRateLimit } from './rateLimit.js';
import { logger, serializeError } from '../../infra/observability/logger.js';

/**
 * Зависимости eventGateway.
 * Gateway не содержит бизнес-логики: только validate/rate-limit/dedup и вызов pipeline.
 */
export type EventGatewayDeps = {
  /** Durable dedup — mandatory (D34/D39); production always wires Postgres `IdempotencyPort`. */
  idempotencyPort: IdempotencyPort;
  pipeline?: {
    run: (event: IncomingEvent) => Promise<void>;
  };
  dedupTtlSec?: number;
};

/**
 * Создает единую входную точку обработки нормализованных событий.
 * Поток: validate -> rateLimit -> dedup -> accepted/rejected/dropped.
 */
export function createEventGateway(deps: EventGatewayDeps): EventGateway {
  const { idempotencyPort, pipeline, dedupTtlSec = 900 } = deps;

  return {
    /** Принимает event-конверт, выполняет технические проверки и возвращает статус gateway. */
    async handleIncomingEvent(
      event: IncomingEvent,
      options?: { runPipeline?: (run: () => Promise<void>) => Promise<void> },
    ): Promise<GatewayResult> {
      try {
        incomingEventSchema.parse(event);
      } catch {
        return {
          status: 'rejected',
          dedupKey: 'invalid:envelope',
          reason: 'INVALID_ENVELOPE',
        };
      }

      const dedupKey = buildDedupKey(event);
      const rate = await checkGatewayRateLimit(event);
      if (!rate.allowed) {
        return {
          status: 'rejected',
          dedupKey,
          reason: rate.reason ?? 'RATE_LIMITED',
        };
      }

      const acquired = await idempotencyPort.tryAcquire(dedupKey, dedupTtlSec);
      if (!acquired) {
        return { status: 'dropped', dedupKey, reason: 'DUPLICATE' };
      }

      if (pipeline) {
        try {
          const runPipeline = () => pipeline.run(event);
          await (options?.runPipeline ? options.runPipeline(runPipeline) : runPipeline());
        } catch (error) {
          const release = idempotencyPort?.release;
          if (release) {
            try {
              await release(dedupKey);
            } catch (releaseErr) {
              logger.error(
                { err: serializeError(releaseErr) },
                'eventGateway dedup release failed',
              );
            }
          }
          logger.error({ err: serializeError(error) }, 'eventGateway pipeline failed');
          return {
            status: 'rejected',
            dedupKey,
            reason: 'PIPELINE_FAILED',
          };
        }
      }

      return { status: 'accepted', dedupKey, event };
    },
  };
}
