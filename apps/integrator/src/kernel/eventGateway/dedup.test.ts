import { describe, expect, it } from 'vitest';
import type { IncomingEvent } from '../contracts/events.js';
import { buildDedupKey } from './dedup.js';

describe('buildDedupKey', () => {
  it('builds canonical key from dedup fingerprint', () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-1',
        occurredAt: '2026-03-03T00:00:00.000Z',
        source: 'source-a',
        dedupFingerprint: {
          status: 'recorded',
          recordId: '777',
          attempt: 123,
        },
      },
      payload: {},
    };

    expect(buildDedupKey(event)).toBe('source-a:message.received:attempt=123:recordId=777:status=recorded');
  });

  it('serializes null fingerprint values deterministically', () => {
    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-2',
        occurredAt: '2026-03-03T00:00:00.000Z',
        source: 'rubitime',
        dedupFingerprint: {
          action: 'updated',
          recordId: '7905420',
          status: null,
        },
      },
      payload: {},
    };

    expect(buildDedupKey(event)).toBe([
      'rubitime:webhook.received',
      'action=updated',
      'recordId=7905420',
      'status=null',
    ].join(':'));
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
