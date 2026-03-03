import type { EventGateway, IncomingEvent } from '../../kernel/contracts/index.js';
import { buildScheduleTickEvent } from './scheduler.js';

export type WorkerTask = {
  id: string;
  kind: 'schedule.tick' | 'retry.delivery';
  payload?: Record<string, unknown>;
};

/** Runtime worker entry placeholder for queued jobs/retries. */
export async function runWorkerTick(
  eventGateway: EventGateway,
  event: IncomingEvent,
): Promise<void> {
  await eventGateway.handleIncomingEvent(event);
}

/**
 * Converts worker tasks to canonical `IncomingEvent(schedule.tick)` and sends them to gateway.
 * Worker does not dispatch to channels directly.
 */
export async function runWorkerTask(
  eventGateway: EventGateway,
  task: WorkerTask,
): Promise<void> {
  const event = buildScheduleTickEvent({
    eventId: `wrk:${task.id}`,
    source: task.kind === 'retry.delivery' ? 'retry-worker' : 'worker',
    payload: {
      trigger: task.kind,
      ...(task.payload ?? {}),
    },
  });
  await eventGateway.handleIncomingEvent(event);
}
