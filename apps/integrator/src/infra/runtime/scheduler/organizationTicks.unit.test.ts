import { describe, expect, it, vi } from 'vitest';
import type { EventGateway, IncomingEvent } from '../../../kernel/contracts/index.js';
import { runSchedulerOrganizationTicks } from './organizationTicks.js';

const ORGANIZATION_ID = 'd0000000-0000-4000-8000-00000000000d';
const OTHER_ORGANIZATION_ID = 'e0000000-0000-4000-8000-00000000000e';
const EVENT_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const OTHER_EVENT_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('scheduler organization ticks', () => {
  it('emits a scheduler event id that fits the signed wake contract', async () => {
    const handleIncomingEvent = vi.fn(async (event: IncomingEvent) => ({
      status: 'accepted' as const,
      dedupKey: event.meta.eventId,
      event,
    }));

    const handled = await runSchedulerOrganizationTicks({
      eventGateway: { handleIncomingEvent } as EventGateway,
      listOrganizationIds: async () => [ORGANIZATION_ID],
      nowIso: () => '2026-08-17T12:00:00.000Z',
      newEventId: () => EVENT_UUID,
    });

    expect(handled).toBe(1);
    const [event] = handleIncomingEvent.mock.calls[0] ?? [];
    expect(event?.meta.eventId).toBe(`sch:${EVENT_UUID}`);
    expect(event?.meta.eventId.length).toBeLessThanOrEqual(64);
    expect(event?.payload.organizationId).toBe(ORGANIZATION_ID);
  });

  it('keeps organization ticks isolated and assigns a fresh wake id to each event', async () => {
    const events: IncomingEvent[] = [];
    const eventIds = [EVENT_UUID, OTHER_EVENT_UUID];
    const newEventId = vi.fn(() => eventIds.shift() ?? 'unexpected');
    const handleIncomingEvent = vi.fn(async (event: IncomingEvent) => {
      events.push(event);
      return {
        status: 'accepted' as const,
        dedupKey: event.meta.eventId,
        event,
      };
    });

    const handled = await runSchedulerOrganizationTicks({
      eventGateway: { handleIncomingEvent } as EventGateway,
      listOrganizationIds: async () => [ORGANIZATION_ID, OTHER_ORGANIZATION_ID],
      nowIso: () => '2026-08-17T12:00:00.000Z',
      newEventId,
    });

    expect(handled).toBe(2);
    expect(newEventId).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.meta.eventId)).toEqual([
      `sch:${EVENT_UUID}`,
      `sch:${OTHER_EVENT_UUID}`,
    ]);
    expect(new Set(events.map((event) => event.meta.eventId)).size).toBe(2);
    expect(events.map((event) => event.payload.organizationId)).toEqual([
      ORGANIZATION_ID,
      OTHER_ORGANIZATION_ID,
    ]);
  });

  it('assigns a fresh wake id when the same organization is swept again', async () => {
    const events: IncomingEvent[] = [];
    const newEventId = vi
      .fn<() => string>()
      .mockReturnValueOnce(EVENT_UUID)
      .mockReturnValueOnce(OTHER_EVENT_UUID);
    const deps = {
      eventGateway: {
        handleIncomingEvent: vi.fn(async (event: IncomingEvent) => {
          events.push(event);
          return { status: 'accepted' as const, dedupKey: event.meta.eventId, event };
        }),
      } as EventGateway,
      listOrganizationIds: async () => [ORGANIZATION_ID],
      nowIso: () => '2026-08-17T12:00:00.000Z',
      newEventId,
    };

    await runSchedulerOrganizationTicks(deps);
    await runSchedulerOrganizationTicks(deps);

    expect(events.map((event) => event.meta.eventId)).toEqual([
      `sch:${EVENT_UUID}`,
      `sch:${OTHER_EVENT_UUID}`,
    ]);
  });
});
