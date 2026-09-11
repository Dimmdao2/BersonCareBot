import { beforeEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

import { runDbJournalRetention } from '@/modules/db-retention/journalRetention';
import { createPgJournalRetentionPort } from '@/infra/repos/pgJournalRetention';

const port = createPgJournalRetentionPort();

function windowOf(target: string): number | undefined {
  const call = fakes.runWebappNamedRoot.mock.calls.find(
    (c) => (c[2] as unknown[])[0] === target,
  );
  return call ? ((call[2] as unknown[])[1] as number) : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('sweeps every still-live Track D journal target in one tick, through the existing roots only', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ affected_count: '2' }] });

  const result = await runDbJournalRetention(port);

  expect(result.dryRun).toBe(false);
  expect(result.results).toEqual([
    { target: 'app.context_nonce_ledger', deleted: 2 },
    { target: 'public_idempotency_keys', deleted: 2 },
    { target: 'integrator_idempotency_keys', deleted: 2 },
    { target: 'outgoing_delivery_queue_sent', deleted: 2 },
    { target: 'outgoing_delivery_queue_dead', deleted: 2 },
    { target: 'notification_delivery_attempts', deleted: 2 },
    { target: 'message_log', deleted: 2 },
    { target: 'reminder_occurrence_history_terminal', deleted: 2 },
    { target: 'media_upload_sessions_completed', deleted: 2 },
    { target: 'saas_isolation_events_resolved', deleted: 2 },
    { target: 'saas_isolation_coverage_runs', deleted: 2 },
  ]);

  const rootsCalled = fakes.runWebappNamedRoot.mock.calls.map((call) => call[1]);
  expect(rootsCalled).toEqual([
    'app.prune_context_nonce_ledger(integer,integer,boolean)',
    ...Array.from({ length: 10 }, () => 'app.prune_retention_target(text,integer,boolean)'),
  ]);
});

/**
 * Всё, что удаляет строки по возрасту, обязано делать это по ЗАПИСАННОМУ числу. Молчаливый дрейф
 * окна — самый дорогой и самый тихий отказ этого механизма: никто не заметит, что журнал стали
 * подметать втрое раньше, пока не понадобится старая строка. Числа взяты из решения владельца
 * 12.09 (#1088) и из уже принятых в репозитории классов; основание каждого записано у константы.
 */
it('runs every recorded window on the number its basis names', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ affected_count: '0' }] });

  await runDbJournalRetention(port);

  expect(windowOf('message_log')).toBe(90);
  expect(windowOf('reminder_occurrence_history_terminal')).toBe(90);
  expect(windowOf('media_upload_sessions_completed')).toBe(365);
  expect(windowOf('saas_isolation_events_resolved')).toBe(365);
  expect(windowOf('saas_isolation_coverage_runs')).toBe(365);
});

it('lets an operator override one window without moving the others', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ affected_count: '5' }] });

  const result = await runDbJournalRetention(port, {
    reminderOccurrenceHistoryRetentionDays: 365,
  });

  expect(windowOf('reminder_occurrence_history_terminal')).toBe(365);
  expect(windowOf('message_log')).toBe(90);
  expect(
    result.results.find((r) => r.target === 'reminder_occurrence_history_terminal'),
  ).toEqual({ target: 'reminder_occurrence_history_terminal', deleted: 5 });
});

it('carries dryRun into every target call', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ affected_count: '0' }] });

  const result = await runDbJournalRetention(port, { dryRun: true });

  expect(result.dryRun).toBe(true);
  for (const call of fakes.runWebappNamedRoot.mock.calls) {
    const args = call[2] as unknown[];
    expect(args[args.length - 1]).toBe(true);
  }
});

it('keeps every target independent: one failing target does not stop the others, and both are reported', async () => {
  let callIndex = 0;
  fakes.runWebappNamedRoot.mockImplementation(() => {
    callIndex += 1;
    if (callIndex === 3) {
      return Promise.reject(new Error('boom'));
    }
    return Promise.resolve({ rows: [{ affected_count: '1' }] });
  });

  await expect(runDbJournalRetention(port)).rejects.toThrow(/integrator_idempotency_keys.*boom/);
  // every target was attempted even though the third one failed.
  expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(11);
});
