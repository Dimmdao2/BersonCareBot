import type { Action, ActionResult, DomainContext } from '../../../contracts/index.js';
import type { ExecutorDeps } from '../helpers.js';
import { persistWrites } from '../helpers.js';

export async function handleBooking(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps,
): Promise<ActionResult> {
  if (action.type === 'booking.upsert') {
    const writes = [{ type: 'booking.upsert' as const, params: action.params }];
    await persistWrites(deps.writePort, writes);
    return { actionId: action.id, status: 'success', writes };
  }

  if (action.type === 'booking.event.insert') {
    const writes = [{
      type: 'event.log' as const,
      params: {
        source: ctx.event.meta.source,
        eventType: ctx.event.type,
        eventId: ctx.event.meta.eventId,
        occurredAt: ctx.event.meta.occurredAt,
        body: action.params,
      },
    }];
    await persistWrites(deps.writePort, writes);
    return { actionId: action.id, status: 'success', writes };
  }

  return { actionId: action.id, status: 'skipped', error: 'BOOKING_HANDLER_UNKNOWN_TYPE' };
}
