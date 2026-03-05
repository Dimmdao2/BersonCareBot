import { describe, expect, it } from 'vitest';
import type { IncomingEvent } from '../contracts/events.js';
import { buildDedupKey } from './dedup.js';

describe('buildDedupKey', () => {
  it('uses meta.dedupKey when available', () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-1',
        occurredAt: '2026-03-03T00:00:00.000Z',
        source: 'source-a',
        dedupKey: 'custom:123:777',
      },
      payload: {},
    };

    expect(buildDedupKey(event)).toBe('custom:123:777');
  });

  it('falls back to source/type/eventId', () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: { eventId: 'evt-3', occurredAt: '2026-03-03T00:00:00.000Z', source: 'source-b' },
      payload: {},
    };

    expect(buildDedupKey(event)).toBe('source-b:message.received:evt-3');
  });
});
