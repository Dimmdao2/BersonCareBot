import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({ recordFinalized: vi.fn() }));

vi.mock('./directPublic/writeReminderProjectionDirect.js', () => ({
  recordReminderOccurrenceFinalizedDirect: fakes.recordFinalized,
  appendReminderDeliveryEventDirect: vi.fn(),
  upsertContentAccessGrantDirect: vi.fn(),
}));
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

describe('reminder occurrence history direct write', () => {
  it('records an orphaned failed occurrence through the canonical public writer', async () => {
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

    await writePort.writeDb({
      type: 'reminders.occurrence.expireOrphanedPending',
      params: { nowIso: '2026-07-31T09:03:01.000Z' },
    });

    expect(expireOrphanedReminderOccurrences).toHaveBeenCalledWith(
      expect.anything(),
      '2026-07-31T09:03:01.000Z',
    );
    expect(fakes.recordFinalized).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        integratorOccurrenceId: 'occ-orphaned-1',
        integratorRuleId: 'rule-1',
        integratorUserId: 'non-numeric-user-id',
        platformUserId: '9f000001-0000-4000-8000-000000000001',
        organizationId: 'a0000000-0000-4000-8000-000000000001',
        status: 'failed',
      }),
    );
  });
});
