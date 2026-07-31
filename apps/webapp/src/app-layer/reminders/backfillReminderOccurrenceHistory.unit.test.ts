import { describe, expect, it } from 'vitest';
import { backfillReminderOccurrenceHistoryRows } from '../../../scripts/lib/backfill-reminder-occurrence-history.mjs';

const failedOccurrence = {
  id: 'occ-failed-1',
  rule_id: 'rule-1',
  user_id: '42',
  category: 'exercise',
  status: 'failed',
  delivery_channel: null,
  error_code: 'orphaned_past_slot',
  occurred_at: '2026-07-31T09:00:00.000Z',
  organization_id: 'a0000000-0000-4000-8000-000000000001',
};

function createHistoryTarget() {
  const history = new Map<string, typeof failedOccurrence>();
  return {
    history,
    target: {
      async listExistingOccurrenceIds(ids: string[]) {
        return new Set(ids.filter((id) => history.has(id)));
      },
      async insertOccurrenceHistoryIfAbsent(row: typeof failedOccurrence) {
        if (history.has(String(row.id))) return false;
        history.set(String(row.id), structuredClone(row));
        return true;
      },
    },
  };
}

describe('failed reminder occurrence history backfill', () => {
  it('adds a failed occurrence once and preserves the existing row on rerun', async () => {
    const { history, target } = createHistoryTarget();

    const first = await backfillReminderOccurrenceHistoryRows([failedOccurrence], target);
    expect(first).toEqual({ inserted: 1, preserved: 0 });
    expect(history.get(failedOccurrence.id)).toEqual(failedOccurrence);

    history.get(failedOccurrence.id)!.error_code = 'existing-history-must-win';
    const second = await backfillReminderOccurrenceHistoryRows(
      [{ ...failedOccurrence, error_code: 'new-source-value' }],
      target,
    );

    expect(second).toEqual({ inserted: 0, preserved: 1 });
    expect(history.size).toBe(1);
    expect(history.get(failedOccurrence.id)?.error_code).toBe('existing-history-must-win');
  });
});
