import { beforeEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
  drizzle: { transaction: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => fakes.drizzle,
}));

import { pgHealthFailureArchivePort } from '@/infra/repos/pgHealthFailureArchive';

beforeEach(() => {
  vi.clearAllMocks();
});

it('prunes the failure archive only through the exact retention root, never a tenant relation', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ deleted_count: '12' }] });

  await expect(pgHealthFailureArchivePort.pruneArchivedOlderThanDays(90)).resolves.toBe(12);

  expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.prune_operator_health_failure_archive(integer)',
    [90],
  ]);
  // A relation DELETE here runs under a tenant wall that demands an organization context the
  // retention sweep can never have: it either raises 42501 or silently deletes nothing.
  expect(fakes.drizzle.transaction).not.toHaveBeenCalled();
  expect(fakes.drizzle.delete).not.toHaveBeenCalled();
});

it('keeps the retention window inside the range the retention root accepts', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ deleted_count: 0 }] });

  await pgHealthFailureArchivePort.pruneArchivedOlderThanDays(0);
  await pgHealthFailureArchivePort.pruneArchivedOlderThanDays(99999);

  expect(fakes.runWebappNamedRoot.mock.calls.map((call) => call[2])).toEqual([[1], [3650]]);
});
