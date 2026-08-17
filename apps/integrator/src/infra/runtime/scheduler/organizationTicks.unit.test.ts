import { describe, expect, it, vi } from 'vitest';
import type { EventGateway, IncomingEvent } from '../../../kernel/contracts/index.js';
import { runSchedulerOrganizationTicks } from './organizationTicks.js';

const ORGANIZATION_ID = 'd0000000-0000-4000-8000-00000000000d';
const EVENT_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

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
});
