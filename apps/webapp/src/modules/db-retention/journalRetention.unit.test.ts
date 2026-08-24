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
  ]);

  const rootsCalled = fakes.runWebappNamedRoot.mock.calls.map((call) => call[1]);
  expect(rootsCalled).toEqual([
    'app.prune_context_nonce_ledger(integer,integer,boolean)',
    'app.prune_retention_target(text,integer,boolean)',
    'app.prune_retention_target(text,integer,boolean)',
    'app.prune_retention_target(text,integer,boolean)',
    'app.prune_retention_target(text,integer,boolean)',
    'app.prune_retention_target(text,integer,boolean)',
  ]);
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
  // all six targets were attempted even though the third one failed
  expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(6);
});
