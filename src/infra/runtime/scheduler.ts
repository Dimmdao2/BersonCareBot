import type { EventGateway, IncomingEvent } from '../../kernel/contracts/index.js';

/** Builds canonical scheduler event envelope for kernel gateway pipeline. */
export function buildScheduleTickEvent(input: {
  eventId: string;
  source?: string;
  payload?: Record<string, unknown>;
}): IncomingEvent {
  return {
    type: 'schedule.tick',
    meta: {
      eventId: input.eventId,
      occurredAt: new Date().toISOString(),
      source: input.source ?? 'scheduler',
    },
    payload: input.payload ?? {},
  };
}

/** Emits `schedule.tick` events into the same gateway pipeline. */
export async function emitScheduleTick(
  eventGateway: EventGateway,
  eventId: string,
  source = 'scheduler',
): Promise<void> {
  const event = buildScheduleTickEvent({ eventId, source, payload: {} });
  await eventGateway.handleIncomingEvent(event);
}
