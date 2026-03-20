import type { DbPort, WebappEventsPort } from '../../../kernel/contracts/index.js';
import {
  claimDueProjectionEvents,
  completeProjectionEvent,
  failProjectionEvent,
  rescheduleProjectionEvent,
} from '../../db/repos/projectionOutbox.js';
import { logger } from '../../observability/logger.js';

const RETRY_BASE_SECONDS = 30;

export async function runProjectionWorkerTick(
  db: DbPort,
  webappEventsPort: WebappEventsPort,
  batchSize = 10,
): Promise<number> {
  const events = await claimDueProjectionEvents(db, batchSize);
  let processed = 0;
  for (const ev of events) {
    const attempt = ev.attemptsDone + 1;
    try {
      const result = await webappEventsPort.emit({
        eventType: ev.eventType,
        idempotencyKey: ev.idempotencyKey,
        occurredAt: ev.occurredAt,
        payload: ev.payload,
      });
      if (result.ok) {
        await completeProjectionEvent(db, ev.id);
      } else if (attempt >= ev.maxAttempts) {
        await failProjectionEvent(db, ev.id, result.error ?? `HTTP ${result.status}`);
        logger.warn({ eventId: ev.id, eventType: ev.eventType, attempt }, 'projection event moved to DLQ');
      } else {
        const delay = RETRY_BASE_SECONDS * Math.pow(2, attempt - 1);
        await rescheduleProjectionEvent(db, ev.id, attempt, delay);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= ev.maxAttempts) {
        await failProjectionEvent(db, ev.id, msg);
        logger.warn({ eventId: ev.id, err }, 'projection event moved to DLQ after exception');
      } else {
        const delay = RETRY_BASE_SECONDS * Math.pow(2, attempt - 1);
        await rescheduleProjectionEvent(db, ev.id, attempt, delay);
      }
    }
    processed++;
  }
  return processed;
}
