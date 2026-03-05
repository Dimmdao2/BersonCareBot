import { describe, expect, it } from 'vitest';
import { evaluateReqSuccessEligibility } from './rubitimeReqSuccessEligibility.js';

describe('evaluateReqSuccessEligibility', () => {
  it('returns false when record is missing', () => {
    const res = evaluateReqSuccessEligibility({
      now: new Date(),
      windowMinutes: 20,
      record: null,
      linkedUser: null,
    });
    expect(res.showButton).toBe(false);
  });

  it('returns false when record is stale', () => {
    const now = new Date();
    const recordAt = new Date(now.getTime() - 60 * 60 * 1000);
    const res = evaluateReqSuccessEligibility({
      now,
      windowMinutes: 5,
      record: {
        rubitimeRecordId: 'rec-1',
        phoneNormalized: '+79990001122',
        payloadJson: {},
        recordAt,
        status: 'updated',
      },
      linkedUser: null,
    });
    expect(res.showButton).toBe(false);
  });

  it('returns false when linked user exists', () => {
    const now = new Date();
    const res = evaluateReqSuccessEligibility({
      now,
      windowMinutes: 20,
      record: {
        rubitimeRecordId: 'rec-1',
        phoneNormalized: '+79990001122',
        payloadJson: {},
        recordAt: now,
        status: 'updated',
      },
      linkedUser: { chatId: 1, telegramId: '1', username: null },
    });
    expect(res.showButton).toBe(false);
  });

  it('returns true when record is fresh and not linked', () => {
    const now = new Date();
    const res = evaluateReqSuccessEligibility({
      now,
      windowMinutes: 20,
      record: {
        rubitimeRecordId: 'rec-1',
        phoneNormalized: '+79990001122',
        payloadJson: {},
        recordAt: now,
        status: 'updated',
      },
      linkedUser: null,
    });
    expect(res.showButton).toBe(true);
  });
});