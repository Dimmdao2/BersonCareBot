import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzleSqlFragmentToApproximateSql } from '@/infra/db/drizzleSqlDebugText';

const runWebappSqlMock = vi.hoisted(() => vi.fn());
const rollbackMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(() => ({})),
  runWebappSql: runWebappSqlMock,
  runWebappTransaction: vi.fn(async (fn: (tx: { rollback: () => void }) => Promise<unknown>) => {
    const tx = { rollback: rollbackMock };
    return fn(tx);
  }),
}));

import { createPgReminderJournalPort } from './pgReminderJournal';

function approxSqlAt(callIndex: number): string {
  const fragment = runWebappSqlMock.mock.calls[callIndex]?.[1];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

describe('createPgReminderJournalPort (pg SQL)', () => {
  beforeEach(() => {
    runWebappSqlMock.mockClear();
    rollbackMock.mockClear();
    runWebappSqlMock.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('logAction throws when INSERT returns no row (rule not found)', async () => {
    const port = createPgReminderJournalPort();
    await expect(
      port.logAction({
        ruleIntegratorId: 'missing-rule',
        platformUserId: 'platform-1',
        occurrenceId: 'occ-1',
        action: 'done',
      }),
    ).rejects.toThrow(/no row inserted/);
    expect(approxSqlAt(0)).toContain('INSERT INTO reminder_journal');
  });

  it('recordSnooze returns not_found and rolls back when occurrence is not owned', async () => {
    const port = createPgReminderJournalPort();
    const result = await port.recordSnooze('platform-user-1', 'occ-missing', 15);
    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(rollbackMock).toHaveBeenCalledTimes(1);
  });

  it('recordSnooze routes the write through the patient action accessor', async () => {
    const snoozedUntil = '2026-06-05T12:00:00.000Z';
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [{ snoozed_until: snoozedUntil }],
      rowCount: 1,
    });
    const port = createPgReminderJournalPort();
    const result = await port.recordSnooze('platform-user-1', 'occ-1', 15);
    expect(result).toEqual({
      ok: true,
      occurrenceId: 'occ-1',
      snoozedUntil,
    });
    expect(rollbackMock).not.toHaveBeenCalled();
    expect(approxSqlAt(0)).toContain('app.patient_snooze_reminder_occurrence');
    expect(approxSqlAt(0)).not.toMatch(/\bUPDATE\s+(?:public\.)?reminder_occurrence_history\b/i);
  });

  it('recordDone returns not_found and rolls back when occurrence is not owned', async () => {
    const port = createPgReminderJournalPort();
    const result = await port.recordDone('platform-user-1', 'occ-missing', 'Europe/Moscow');
    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(rollbackMock).toHaveBeenCalledTimes(1);
  });

  it('recordDone treats duplicate done journal as idempotent (reuses existing created_at)', async () => {
    const doneAt = '2026-06-05T10:00:00.000Z';
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          done_at: doneAt,
          first_done_for_occurrence: false,
          day_sent_total: 1,
          day_done_count: 1,
          day_fully_done: false,
        },
      ],
      rowCount: 1,
    });
    const port = createPgReminderJournalPort();
    const result = await port.recordDone('platform-user-1', 'occ-dup', 'Europe/Moscow');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.firstDoneForOccurrence).toBe(false);
    expect(result.doneAt).toBe(doneAt);
    expect(approxSqlAt(0)).toContain('app.patient_done_reminder_occurrence');
  });

  it('recordSkip returns ok with skippedAt when UPDATE succeeds', async () => {
    const skippedAt = '2026-06-05T11:00:00.000Z';
    runWebappSqlMock.mockResolvedValueOnce({ rows: [{ skipped_at: skippedAt }], rowCount: 1 });
    const port = createPgReminderJournalPort();
    const result = await port.recordSkip('platform-user-1', 'occ-skip', 'busy');
    expect(result).toEqual({
      ok: true,
      occurrenceId: 'occ-skip',
      skippedAt,
    });
    expect(approxSqlAt(0)).toContain('app.patient_skip_reminder_occurrence');
    expect(approxSqlAt(0)).toContain('NULL');
    expect(approxSqlAt(0)).not.toMatch(/\bUPDATE\s+(?:public\.)?reminder_occurrence_history\b/i);
  });

  it('never issues a raw reminder_occurrence_history UPDATE for patient snooze or skip', async () => {
    const snoozedUntil = '2026-06-05T12:00:00.000Z';
    const skippedAt = '2026-06-05T13:00:00.000Z';
    runWebappSqlMock
      .mockResolvedValueOnce({ rows: [{ snoozed_until: snoozedUntil }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ skipped_at: skippedAt }], rowCount: 1 });

    const port = createPgReminderJournalPort();
    await expect(port.recordSnooze('platform-user-1', 'occ-snooze', 30)).resolves.toEqual({
      ok: true,
      occurrenceId: 'occ-snooze',
      snoozedUntil,
    });
    await expect(port.recordSkip('platform-user-1', 'occ-skip', 'web_push')).resolves.toEqual({
      ok: true,
      occurrenceId: 'occ-skip',
      skippedAt,
    });

    const issuedSql = runWebappSqlMock.mock.calls.map((_, index) => approxSqlAt(index)).join('\n');
    expect(issuedSql).toContain('app.patient_snooze_reminder_occurrence');
    expect(issuedSql).toContain('app.patient_skip_reminder_occurrence');
    expect(issuedSql).not.toMatch(/\bUPDATE\s+(?:public\.)?reminder_occurrence_history\b/i);
  });

  it('recordSkip rolls back when UPDATE returns no skipped_at', async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const port = createPgReminderJournalPort();
    const result = await port.recordSkip('platform-user-1', 'occ-bad', 'busy');
    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(rollbackMock).toHaveBeenCalled();
  });
});
