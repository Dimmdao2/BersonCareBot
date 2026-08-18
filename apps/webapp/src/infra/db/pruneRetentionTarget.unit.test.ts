import { beforeEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
  drizzle: { transaction: vi.fn(), delete: vi.fn(), select: vi.fn() },
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => fakes.drizzle,
}));

import { pruneRetentionTarget } from '@/infra/db/pruneRetentionTarget';
import { purgeStaleMediaHlsProxyErrorEvents } from '@/app-layer/media/hlsProxyErrorEvents';

beforeEach(() => {
  vi.clearAllMocks();
});

it('sweeps a locked tenant table only through the exact retention root, never a relation delete', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ affected_count: '7' }] });

  await expect(pruneRetentionTarget('product_push_notifications', 730)).resolves.toBe(7);

  expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.prune_retention_target(text,integer,boolean)',
    ['product_push_notifications', 730, false],
  ]);
  // A relation DELETE here runs under a tenant wall demanding an organization context that a
  // cross-clinic sweep can never have: it either raises 42501 or silently deletes nothing.
  expect(fakes.drizzle.transaction).not.toHaveBeenCalled();
  expect(fakes.drizzle.delete).not.toHaveBeenCalled();
});

it('carries the dry-run decision into the root instead of counting over the walled relation', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ affected_count: 3 }] });

  await expect(
    pruneRetentionTarget('product_analytics_events_recent', 90, { dryRun: true }),
  ).resolves.toBe(3);

  expect(fakes.runWebappNamedRoot.mock.calls[0]?.[2]).toEqual([
    'product_analytics_events_recent',
    90,
    true,
  ]);
  expect(fakes.drizzle.select).not.toHaveBeenCalled();
});

it('keeps the retention window inside the range the retention root accepts', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ affected_count: 0 }] });

  await pruneRetentionTarget('product_analytics_user_hourly', 0);
  await pruneRetentionTarget('product_analytics_user_hourly', 99999);

  expect(fakes.runWebappNamedRoot.mock.calls.map((call) => call[2])).toEqual([
    ['product_analytics_user_hourly', 1, false],
    ['product_analytics_user_hourly', 3650, false],
  ]);
});

it('routes the HLS proxy error retention tick through the same single root', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ affected_count: '5' }] });

  await expect(
    purgeStaleMediaHlsProxyErrorEvents({ retentionDays: 90, dryRun: false }),
  ).resolves.toEqual({ deleted: 5, dryRun: false, retentionDays: 90 });

  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.prune_retention_target(text,integer,boolean)',
    ['media_hls_proxy_error_events', 90, false],
  ]);
  expect(fakes.drizzle.delete).not.toHaveBeenCalled();
});
