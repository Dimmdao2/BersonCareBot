/* eslint-disable no-secrets/no-secrets -- test suite identifiers are not credentials */
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { describe, expect, it, vi } from 'vitest';
import type { EventGateway, IncomingEvent } from '../../../kernel/contracts/index.js';
import { runSchedulerOrganizationTicks } from './organizationTicks.js';

describe('runSchedulerOrganizationTicks', () => {
  it('keeps discovery and idempotency in scheduler infra and hands only pipeline work to each organization', async () => {
    const organizations = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ];
    const principals: unknown[] = [];
    const events: IncomingEvent[] = [];
    const handleIncomingEvent: EventGateway['handleIncomingEvent'] = vi.fn(async (event, options) => {
      events.push(event);
      principals.push(getCurrentDbPrincipal());
      await options?.runPipeline?.(async () => {
        principals.push(getCurrentDbPrincipal());
      });
      principals.push(getCurrentDbPrincipal());
      return { status: 'accepted' as const, dedupKey: event.meta.eventId, event };
    });
    const ids = ['event-a', 'event-b'];

    const count = await runSchedulerOrganizationTicks({
      eventGateway: { handleIncomingEvent },
      listOrganizationIds: vi.fn(async () => {
        principals.push(getCurrentDbPrincipal());
        return organizations;
      }),
      nowIso: () => '2026-07-16T10:00:00.000Z',
      newEventId: () => ids.shift()!,
    });

    expect(count).toBe(2);
    expect(events.map((event) => event.meta.eventId)).toEqual([
      `sch:${organizations[0]}:event-a`,
      `sch:${organizations[1]}:event-b`,
    ]);
    expect(events.map((event) => event.payload.organizationId)).toEqual(organizations);
    expect(principals).toEqual([
      { kind: 'infra', source: 'scheduler:claim-due-jobs' },
      { kind: 'infra', source: 'scheduler:handle-tick-event' },
      { kind: 'organization', organizationId: organizations[0] },
      { kind: 'infra', source: 'scheduler:handle-tick-event' },
      { kind: 'infra', source: 'scheduler:handle-tick-event' },
      { kind: 'organization', organizationId: organizations[1] },
      { kind: 'infra', source: 'scheduler:handle-tick-event' },
    ]);
    expect(getCurrentDbPrincipal()).toBeUndefined();
  });

  it('surfaces a rejected organization pipeline to the scheduler loop', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await expect(runSchedulerOrganizationTicks({
      eventGateway: {
        handleIncomingEvent: vi.fn(async () => ({
          status: 'rejected' as const,
          dedupKey: 'scheduler-key',
          reason: 'PIPELINE_FAILED',
        })),
      },
      listOrganizationIds: vi.fn(async () => [organizationId]),
      nowIso: () => '2026-07-16T10:00:00.000Z',
      newEventId: () => 'event-a',
    })).rejects.toThrow(`Scheduler organization tick rejected for ${organizationId}`);
  });
});
