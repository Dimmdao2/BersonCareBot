import { describe, expect, it } from 'vitest';
import { APPOINTMENT_RECORD_UPSERTED, REMINDER_RULE_UPSERTED } from '../../../kernel/contracts/index.js';
import { hashPayload, projectionIdempotencyKey } from './projectionKeys.js';
import {
  deepReplaceIntegratorUserIdInValue,
  payloadLikelyReferencesUserId,
  recomputeProjectionIdempotencyKeyAfterMerge,
} from './projectionOutboxMergePolicy.js';

describe('projectionOutboxMergePolicy', () => {
  it('deepReplaceIntegratorUserIdInValue replaces string and number forms', () => {
    const out = deepReplaceIntegratorUserIdInValue(
      { integratorUserId: '7', nested: { integratorUserId: 7 }, keep: '17' },
      '7',
      '99',
    ) as Record<string, unknown>;
    expect(out.integratorUserId).toBe('99');
    expect(out.nested).toEqual({ integratorUserId: 99 });
    expect(out.keep).toBe('17');
  });

  it('payloadLikelyReferencesUserId detects common shapes', () => {
    expect(payloadLikelyReferencesUserId({ integratorUserId: '42' }, '42')).toBe(true);
    expect(payloadLikelyReferencesUserId({ integratorUserId: '4' }, '42')).toBe(false);
    expect(payloadLikelyReferencesUserId({ x: 1 }, '42')).toBe(false);
  });

  it('recomputeProjectionIdempotencyKeyAfterMerge: user.upserted tracks user in stable id', () => {
    const loserPayload = { integratorUserId: '5', channelCode: 'telegram', externalId: '1' };
    const winnerPayload = deepReplaceIntegratorUserIdInValue(loserPayload, '5', '9') as Record<string, unknown>;
    const oldKey = projectionIdempotencyKey('user.upserted', '5', hashPayload(loserPayload as Record<string, unknown>));
    const newKey = recomputeProjectionIdempotencyKeyAfterMerge('user.upserted', winnerPayload, 1);
    expect(newKey).not.toBe(oldKey);
    expect(newKey).toBe(projectionIdempotencyKey('user.upserted', '9', hashPayload(winnerPayload)));
  });

  it('recomputeProjectionIdempotencyKeyAfterMerge: support.conversation.opened ignores integratorUserId in fingerprint', () => {
    const base = {
      integratorConversationId: 'c1',
      integratorUserId: '3',
      source: 'telegram',
      adminScope: 'default',
      status: 'open',
      openedAt: '2026-01-01T00:00:00.000Z',
      lastMessageAt: '2026-01-01T00:00:00.000Z',
    };
    const a = { ...base, integratorUserId: '3' };
    const b = { ...base, integratorUserId: '9' };
    const ka = recomputeProjectionIdempotencyKeyAfterMerge('support.conversation.opened', a, 10);
    const kb = recomputeProjectionIdempotencyKeyAfterMerge('support.conversation.opened', b, 11);
    expect(ka).toBe(kb);
  });

  it('recomputeProjectionIdempotencyKeyAfterMerge: appointment uses integratorRecordId and full payload hash', () => {
    const rid = 'rec-ext-1';
    const p = {
      integratorRecordId: rid,
      payloadJson: { integratorUserId: '2' },
      status: 'updated',
      lastEvent: 'x',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const p2 = deepReplaceIntegratorUserIdInValue(p, '2', '8') as Record<string, unknown>;
    const k1 = recomputeProjectionIdempotencyKeyAfterMerge(APPOINTMENT_RECORD_UPSERTED, p, 3);
    const k2 = recomputeProjectionIdempotencyKeyAfterMerge(APPOINTMENT_RECORD_UPSERTED, p2, 4);
    expect(k1).not.toBe(k2);
    expect(k2).toBe(projectionIdempotencyKey(APPOINTMENT_RECORD_UPSERTED, rid, hashPayload(p2)));
  });

  it('recomputeProjectionIdempotencyKeyAfterMerge: reminder.rule ignores updatedAt but not integratorUserId', () => {
    const base = {
      integratorRuleId: 'rule-1',
      integratorUserId: '1',
      category: 'water',
      isEnabled: true,
      scheduleType: 'interval_window',
      timezone: 'UTC',
      intervalMinutes: 60,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: '1111111',
      contentMode: 'none',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const onlyTime = { ...base, updatedAt: '2026-01-02T00:00:00.000Z' };
    const kA = recomputeProjectionIdempotencyKeyAfterMerge(REMINDER_RULE_UPSERTED, base, 5);
    const kTime = recomputeProjectionIdempotencyKeyAfterMerge(REMINDER_RULE_UPSERTED, onlyTime, 6);
    expect(kA).toBe(kTime);

    const movedUser = deepReplaceIntegratorUserIdInValue(base, '1', '2') as Record<string, unknown>;
    const kUser = recomputeProjectionIdempotencyKeyAfterMerge(REMINDER_RULE_UPSERTED, movedUser, 7);
    expect(kUser).not.toBe(kA);
  });
});
