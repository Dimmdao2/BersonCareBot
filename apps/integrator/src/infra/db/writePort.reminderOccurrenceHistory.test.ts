import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({
  markSent: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock('./repos/reminders.js', async () => {
  const actual = await vi.importActual<typeof import('./repos/reminders.js')>('./repos/reminders.js');
  return {
    ...actual,
    markReminderOccurrenceSent: fakes.markSent,
    markReminderOccurrenceFailed: fakes.markFailed,
  };
});

import { createDbWritePort } from './writePort.js';

function unusedDbPort(): DbPort {
  return {
    async query() {
      throw new Error('query must not be used in this scenario');
    },
    async tx(fn) {
      return fn(this);
    },
  };
}

describe('reminder occurrence history direct write (Track D #987, post single-store cutover)', () => {
  it('markSent writes straight to the one canonical row and returns without any second write', async () => {
    fakes.markSent.mockResolvedValue(undefined);
    const writePort = createDbWritePort({ db: unusedDbPort() });

    await writePort.writeDb({
      type: 'reminders.occurrence.markSent',
      params: { occurrenceId: 'occ-sent-1', channel: 'telegram' },
    });

    expect(fakes.markSent).toHaveBeenCalledTimes(1);
    expect(fakes.markSent).toHaveBeenCalledWith(expect.anything(), 'occ-sent-1', 'telegram');
  });

  it('markFailed writes straight to the one canonical row and returns without any second write', async () => {
    fakes.markFailed.mockResolvedValue(undefined);
    const writePort = createDbWritePort({ db: unusedDbPort() });

    await writePort.writeDb({
      type: 'reminders.occurrence.markFailed',
      params: { occurrenceId: 'occ-failed-1', channel: 'telegram', errorCode: 'synthetic_failure' },
    });

    expect(fakes.markFailed).toHaveBeenCalledTimes(1);
    expect(fakes.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      'occ-failed-1',
      'telegram',
      'synthetic_failure',
    );
  });

  it('expireOrphanedPending finalizes through the single injected repo call and needs no second write per row', async () => {
    const expireOrphanedReminderOccurrences = vi.fn().mockResolvedValue([
      {
        occurrenceId: 'occ-orphaned-1',
        ruleId: 'rule-1',
        userId: 'non-numeric-user-id',
        platformUserId: '9f000001-0000-4000-8000-000000000001',
        organizationId: 'a0000000-0000-4000-8000-000000000001',
        category: 'exercise',
        status: 'failed',
        occurredAt: '2026-07-31T09:00:00.000Z',
        deliveryChannel: null,
        errorCode: 'orphaned_past_slot',
      },
    ]);
    const writePort = createDbWritePort({
      db: unusedDbPort(),
      expireOrphanedReminderOccurrences,
    });

    // No exception, no second write attempted — the UPDATE inside the injected function is already
    // the complete finalize; the writer only summarizes the returned contexts for a log line.
    await expect(
      writePort.writeDb({
        type: 'reminders.occurrence.expireOrphanedPending',
        params: { nowIso: '2026-07-31T09:03:01.000Z' },
      }),
    ).resolves.toBeUndefined();

    expect(expireOrphanedReminderOccurrences).toHaveBeenCalledWith(
      expect.anything(),
      '2026-07-31T09:03:01.000Z',
    );
  });
});
