import { describe, expect, it } from 'vitest';
import type { IncomingEvent } from '../contracts/events.js';
import { buildDedupKey } from './dedup.js';

describe('buildDedupKey', () => {
  it('uses telegram updateId and telegramId when available', () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: { eventId: 'evt-1', occurredAt: '2026-03-03T00:00:00.000Z', source: 'telegram' },
      payload: { updateId: 777, incoming: { telegramId: '123' } },
    };

    expect(buildDedupKey(event)).toBe('telegram:123:777');
  });

  it('uses rubitime event + record id when available', () => {
    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: { eventId: 'evt-2', occurredAt: '2026-03-03T00:00:00.000Z', source: 'rubitime' },
      payload: { body: { event: 'event-update-record', data: { id: 'rec-1' } } },
    };

    expect(buildDedupKey(event)).toBe('rubitime:event-update-record:rec-1');
  });

  it('falls back to source/type/eventId', () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: { eventId: 'evt-3', occurredAt: '2026-03-03T00:00:00.000Z', source: 'unknown' },
      payload: {},
    };

    expect(buildDedupKey(event)).toBe('unknown:message.received:evt-3');
  });
});
