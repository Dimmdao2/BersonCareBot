import { describe, expect, it, vi } from 'vitest';
import type { DbPort, WebappEventBody, WebappEventsPort } from '../../kernel/contracts/index.js';
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

describe('reminder occurrence history fanout', () => {
  it('publishes an orphaned failed occurrence for durable history ingest', async () => {
    const emitted: WebappEventBody[] = [];
    const webappEventsPort: WebappEventsPort = {
      async emit(event) {
        emitted.push(event);
        return { ok: true, status: 202 };
      },
    };
    const expireOrphanedReminderOccurrences = vi.fn().mockResolvedValue([
      {
        occurrenceId: 'occ-orphaned-1',
        ruleId: 'rule-1',
        userId: 'non-numeric-user-id',
        category: 'exercise',
        status: 'failed',
        occurredAt: '2026-07-31T09:00:00.000Z',
        deliveryChannel: null,
        errorCode: 'orphaned_past_slot',
      },
    ]);
    const writePort = createDbWritePort({
      db: unusedDbPort(),
      webappEventsPort,
      expireOrphanedReminderOccurrences,
    });

    await writePort.writeDb({
      type: 'reminders.occurrence.expireOrphanedPending',
      params: { nowIso: '2026-07-31T09:03:01.000Z' },
    });

    expect(expireOrphanedReminderOccurrences).toHaveBeenCalledWith(
      expect.anything(),
      '2026-07-31T09:03:01.000Z',
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      eventType: 'reminder.occurrence.finalized',
      occurredAt: '2026-07-31T09:00:00.000Z',
      payload: {
        integratorOccurrenceId: 'occ-orphaned-1',
        integratorRuleId: 'rule-1',
        integratorUserId: 'non-numeric-user-id',
        category: 'exercise',
        status: 'failed',
        deliveryChannel: null,
        errorCode: 'orphaned_past_slot',
        occurredAt: '2026-07-31T09:00:00.000Z',
      },
    });
  });
});
