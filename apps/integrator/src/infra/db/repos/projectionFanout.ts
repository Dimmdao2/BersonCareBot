import type { DbPort, WebappEventBody, WebappEventsPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { enqueueProjectionEvent } from './projectionOutbox.js';

export type ProjectionFanoutInput = {
  eventType: string;
  idempotencyKey: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

/**
 * Try immediate signed POST to webapp; enqueue outbox only when emit fails (network, 5xx, missing config).
 * Keeps worker as retry path instead of the default delivery path.
 */
export async function tryEmitWebappProjectionThenEnqueue(
  db: DbPort,
  webappEventsPort: WebappEventsPort | undefined,
  input: ProjectionFanoutInput,
): Promise<void> {
  const body: WebappEventBody = {
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt,
    payload: input.payload,
  };
  if (webappEventsPort) {
    const result = await webappEventsPort.emit(body);
    if (result.ok) return;
    const errSnippet =
      typeof result.error === 'string' && result.error.length > 800
        ? `${result.error.slice(0, 800)}…`
        : result.error;
    logger.warn(
      {
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        status: result.status,
        error: errSnippet,
      },
      'projection fanout: sync emit failed, enqueued for worker',
    );
  }
  await enqueueProjectionEvent(db, input);
}
