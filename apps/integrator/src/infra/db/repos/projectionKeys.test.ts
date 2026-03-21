import { describe, expect, it } from 'vitest';
import { projectionIdempotencyKey, hashPayload } from './projectionKeys.js';

describe('projectionIdempotencyKey', () => {
  it('returns deterministic key for same inputs', () => {
    const a = projectionIdempotencyKey('user.upserted', '42', 'fp1');
    const b = projectionIdempotencyKey('user.upserted', '42', 'fp1');
    expect(a).toBe(b);
  });

  it('returns different key for different fingerprint', () => {
    const a = projectionIdempotencyKey('user.upserted', '42', 'fp1');
    const b = projectionIdempotencyKey('user.upserted', '42', 'fp2');
    expect(a).not.toBe(b);
  });

  it('returns key without fingerprint when omitted', () => {
    const key = projectionIdempotencyKey('contact.linked', '99');
    expect(key).toBe('contact.linked:99');
  });

  it('truncates key via sha256 when exceeding 200 chars', () => {
    const longId = 'x'.repeat(200);
    const key = projectionIdempotencyKey('user.upserted', longId, 'fp');
    expect(key.length).toBeLessThanOrEqual(200);
    expect(key).toMatch(/^user\.upserted:/);
  });
});

describe('hashPayload', () => {
  it('produces same hash regardless of key order', () => {
    const a = hashPayload({ b: 2, a: 1 });
    const b = hashPayload({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('produces different hash for different values', () => {
    const a = hashPayload({ a: 1 });
    const b = hashPayload({ a: 2 });
    expect(a).not.toBe(b);
  });

  it('produces same hash for nested objects with different key order', () => {
    const a = hashPayload({
      user: { id: '42', profile: { lastName: 'Doe', firstName: 'John' } },
      flags: { active: true, beta: false },
    });
    const b = hashPayload({
      flags: { beta: false, active: true },
      user: { profile: { firstName: 'John', lastName: 'Doe' }, id: '42' },
    });
    expect(a).toBe(b);
  });

  it('returns 16-char hex string', () => {
    const h = hashPayload({ test: true });
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
