import { describe, expect, it } from 'vitest';
import { evaluateLinkCheckEligibility, isRecordFresh } from './linkCheckEligibility.js';

describe('link check eligibility', () => {
  const now = new Date('2026-02-25T10:00:00.000Z');

  it('returns showButton=true for existing fresh unlinked record', () => {
    const result = evaluateLinkCheckEligibility({
      now,
      windowMinutes: 20,
      record: {
        rubitimeRecordId: '7835001',
        phoneNormalized: '+79990001122',
        payloadJson: {},
        recordAt: new Date('2026-02-25T09:50:00.000Z'),
        status: 'created',
      },
      linkedUser: null,
    });

    expect(result).toEqual({ showButton: true });
  });

  it('returns showButton=false when record does not exist', () => {
    const result = evaluateLinkCheckEligibility({
      now,
      windowMinutes: 20,
      record: null,
      linkedUser: null,
    });
    expect(result).toEqual({ showButton: false });
  });

  it('returns showButton=false when record is already linked', () => {
    const result = evaluateLinkCheckEligibility({
      now,
      windowMinutes: 20,
      record: {
        rubitimeRecordId: '7835001',
        phoneNormalized: '+79990001122',
        payloadJson: {},
        recordAt: new Date('2026-02-25T09:50:00.000Z'),
        status: 'created',
      },
      linkedUser: { chatId: 1, telegramId: '1', username: 'test' },
    });
    expect(result).toEqual({ showButton: false });
  });

  it('returns showButton=false when record is older than window', () => {
    const result = evaluateLinkCheckEligibility({
      now,
      windowMinutes: 20,
      record: {
        rubitimeRecordId: '7835001',
        phoneNormalized: '+79990001122',
        payloadJson: {},
        recordAt: new Date('2026-02-25T09:39:00.000Z'),
        status: 'created',
      },
      linkedUser: null,
    });
    expect(result).toEqual({ showButton: false });
  });

  it('isRecordFresh handles null and future values', () => {
    expect(isRecordFresh(null, now, 20)).toBe(false);
    expect(isRecordFresh(new Date('2026-02-25T10:01:00.000Z'), now, 20)).toBe(false);
  });
});
