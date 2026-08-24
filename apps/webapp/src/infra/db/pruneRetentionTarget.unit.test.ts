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

import { pruneContextNonceLedger, pruneRetentionTarget } from '@/infra/db/pruneRetentionTarget';
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

it('sweeps every Track D journal target through the same single root', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ affected_count: '1' }] });

  for (const target of [
    'public_idempotency_keys',
    'integrator_idempotency_keys',
    'outgoing_delivery_queue_sent',
    'outgoing_delivery_queue_dead',
    'notification_delivery_attempts',
  ] as const) {
    await expect(pruneRetentionTarget(target, 30)).resolves.toBe(1);
  }

  expect(fakes.runWebappNamedRoot.mock.calls.map((call) => call[2])).toEqual([
    ['public_idempotency_keys', 30, false],
    ['integrator_idempotency_keys', 30, false],
    ['outgoing_delivery_queue_sent', 30, false],
    ['outgoing_delivery_queue_dead', 30, false],
    ['notification_delivery_attempts', 30, false],
  ]);
  expect(fakes.drizzle.delete).not.toHaveBeenCalled();
});

it('sweeps app.context_nonce_ledger through its own dedicated root, clamping grace and limit', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ affected_count: '42' }] });

  await expect(pruneContextNonceLedger(3600, 200_000)).resolves.toBe(42);
  await expect(pruneContextNonceLedger(-1, 999_999_999)).resolves.toBe(42);
  await expect(pruneContextNonceLedger(999_999, 0)).resolves.toBe(42);

  expect(fakes.runWebappNamedRoot.mock.calls.map((call) => call.slice(1, 3))).toEqual([
    ['app.prune_context_nonce_ledger(integer,integer,boolean)', [3600, 200_000, false]],
    ['app.prune_context_nonce_ledger(integer,integer,boolean)', [0, 500_000, false]],
    ['app.prune_context_nonce_ledger(integer,integer,boolean)', [86400, 1, false]],
  ]);
  expect(fakes.drizzle.delete).not.toHaveBeenCalled();
});
