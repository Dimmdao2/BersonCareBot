import { describe, expect, it } from 'vitest';
import {
  messengerPhoneBindDedupKey,
  parseAdminIncidentAlertConfigIntegrator,
} from './adminIncidentAlertRelay.js';

describe('parseAdminIncidentAlertConfigIntegrator', () => {
  it('defaults when null', () => {
    const c = parseAdminIncidentAlertConfigIntegrator(null);
    expect(c.topics.messenger_phone_bind_blocked).toBe(true);
    expect(c.channels.max).toBe(true);
  });

  it('merges known topic flags', () => {
    const c = parseAdminIncidentAlertConfigIntegrator({
      value: { topics: { channel_link: false }, channels: { max: false } },
    });
    expect(c.topics.channel_link).toBe(false);
    expect(c.topics.auto_merge_conflict).toBe(true);
    expect(c.channels.max).toBe(false);
  });
});

describe('messengerPhoneBindDedupKey', () => {
  it('uses conflict key for blocked topic', () => {
    expect(
      messengerPhoneBindDedupKey({
        topic: 'messenger_phone_bind_blocked',
        conflictKey: 'abc',
        reason: 'x',
        candidateIds: [],
        details: {},
      }),
    ).toBe('abc');
  });

  it('is stable under candidate id reorder when no conflict key', () => {
    const base = {
      topic: 'messenger_phone_bind_anomaly' as const,
      conflictKey: null,
      reason: 'r',
      details: {},
    };
    const a = messengerPhoneBindDedupKey({
      ...base,
      candidateIds: ['b', 'a', 'b'],
    });
    const b = messengerPhoneBindDedupKey({
      ...base,
      candidateIds: ['a', 'b'],
    });
    expect(a).toBe(b);
  });
});
