import { describe, expect, it } from 'vitest';
import { buildIntegratorEventsHttpBody, jsonStableStringify } from './jsonStableStringify.js';

describe('jsonStableStringify', () => {
  it('produces the same string for objects with different key insertion order', () => {
    const a = { z: 1, a: { nested: true, b: 2 } };
    const b = { a: { b: 2, nested: true }, z: 1 };
    expect(jsonStableStringify(a)).toBe(jsonStableStringify(b));
  });

  it('stable HTTP body for projection user upsert shape', () => {
    const event1 = {
      eventType: 'user.upserted',
      occurredAt: '2026-01-01T00:00:00.000Z',
      idempotencyKey: 'user.upserted:42:abc',
      payload: { integratorUserId: '42', channelCode: 'telegram', externalId: 'x' } as Record<string, unknown>,
    };
    const event2 = {
      eventType: 'user.upserted',
      occurredAt: '2026-01-01T00:00:00.000Z',
      idempotencyKey: 'user.upserted:42:abc',
      payload: { externalId: 'x', channelCode: 'telegram', integratorUserId: '42' } as Record<string, unknown>,
    };
    expect(buildIntegratorEventsHttpBody(event1)).toBe(buildIntegratorEventsHttpBody(event2));
  });

  it('throws on circular structures', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => jsonStableStringify(obj)).toThrow(/circular/i);
  });
});
