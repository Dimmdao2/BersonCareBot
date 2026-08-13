import { beforeEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

import { pgOperatorHealthReadPort } from '@/infra/repos/pgOperatorHealthRead';
import { pgOperatorHealthWritePort } from '@/infra/repos/pgOperatorHealthWrite';

beforeEach(() => {
  vi.clearAllMocks();
});

it('reads webhook bursts only through the exact aggregate root', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({
    rows: [{ source: 'telegram', error_class: 'webhook_parse_failed', event_count: '4' }],
  });

  await expect(pgOperatorHealthReadPort.listWebhookBurstSignals(5, 3)).resolves.toEqual([
    { source: 'telegram', errorClass: 'webhook_parse_failed', count: 4 },
  ]);
  expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.list_integration_webhook_burst_signals(integer,integer)',
    [5, 3],
  ]);
});

it('prunes webhook errors only through the exact retention root', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ deleted_count: '7' }] });

  await expect(
    pgOperatorHealthWritePort.purgeIntegrationWebhookErrorEventsOlderThanHours(24),
  ).resolves.toEqual({ deleted: 7 });
  expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.prune_integration_webhook_error_events(integer)',
    [24],
  ]);
});
