import { describe, expect, it } from 'vitest';
import { USER_SUBSCRIPTION_UPSERTED } from '../../../kernel/contracts/index.js';
import { projectionIdempotencyKey, hashPayload, hashPayloadExcludingKeys } from './projectionKeys.js';

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

  it('includes fingerprint for contact.linked when provided', () => {
    const key = projectionIdempotencyKey('contact.linked', '99', 'fp1');
    expect(key).toBe('contact.linked:99:fp1');
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

  it('hashPayloadExcludingKeys ignores listed keys so integratorUserId does not change fingerprint', () => {
    const base = {
      integratorConversationId: 'conv-1',
      source: 'telegram',
      adminScope: 'support',
      status: 'waiting_admin',
      openedAt: '2025-01-01T12:00:00.000Z',
      lastMessageAt: '2025-01-01T12:00:00.000Z',
      channelCode: 'telegram',
      channelExternalId: '123',
    };
    const a = hashPayloadExcludingKeys({ ...base, integratorUserId: '42' }, ['integratorUserId']);
    const b = hashPayloadExcludingKeys({ ...base, integratorUserId: '9001' }, ['integratorUserId']);
    expect(a).toBe(b);
  });

  it('stable subscription idempotency segment uses canonical user id string', () => {
    const topicId = 100;
    const alias = '2';
    const winner = '9';
    const keyAlias = projectionIdempotencyKey(
      USER_SUBSCRIPTION_UPSERTED,
      `${alias}:${topicId}`,
      hashPayload({
        integratorUserId: alias,
        integratorTopicId: String(topicId),
        isActive: true,
        updatedAt: 't',
      }),
    );
    const keyWinner = projectionIdempotencyKey(
      USER_SUBSCRIPTION_UPSERTED,
      `${winner}:${topicId}`,
      hashPayload({
        integratorUserId: winner,
        integratorTopicId: String(topicId),
        isActive: true,
        updatedAt: 't',
      }),
    );
    expect(keyAlias).not.toBe(keyWinner);
  });
});
