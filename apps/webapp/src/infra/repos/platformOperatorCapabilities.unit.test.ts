import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getWebappSqlDb: vi.fn(() => ({ kind: 'db' })),
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: vi.fn() }));

import { pgHealthFailureArchivePort } from './pgHealthFailureArchive';
import { pgOperatorHealthWritePort } from './pgOperatorHealthWrite';

const ACTOR_ID = '00000000-0000-4000-8000-000000000101';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('platform operator DB capabilities', () => {
  it('acknowledges and resolves incidents only through their exact named roots', async () => {
    fakes.runWebappNamedRoot
      .mockResolvedValueOnce({ rows: [{ acknowledged_count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ resolved_count: '4' }] });

    await expect(
      pgOperatorHealthWritePort.acknowledgeOpenOutboundProviderIncidents(),
    ).resolves.toEqual({ acknowledged: 3 });
    await expect(pgOperatorHealthWritePort.resolveAllOpenIncidents()).resolves.toEqual({
      resolved: 4,
    });

    expect(fakes.runWebappNamedRoot.mock.calls.map((call) => call[1])).toEqual([
      'app.acknowledge_open_outbound_provider_incidents()',
      'app.resolve_all_open_operator_incidents()',
    ]);
  });

  it('archives one bounded batch through the exact root without exposing queue rows', async () => {
    fakes.runWebappNamedRoot.mockResolvedValue({
      rows: [{ inserted_count: '2', deleted_count: '2' }],
    });

    await expect(
      pgHealthFailureArchivePort.archiveOutgoingDeadBatch({
        limit: 500,
        archivedByUserId: ACTOR_ID,
      }),
    ).resolves.toEqual({ inserted: 2, deleted: 2 });

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
      'app.archive_operator_health_failures(text,integer,uuid)',
      ['outgoing_delivery', 500, ACTOR_ID],
    ]);
  });

  it('lists a sanitized archive row through an exact named root', async () => {
    fakes.runWebappNamedRoot.mockResolvedValue({
      rows: [
        {
          id: '00000000-0000-4000-8000-000000000102',
          archived_at: '2026-08-13T10:00:00.000Z',
          archived_by_user_id: ACTOR_ID,
          health_probe: 'outgoing_delivery',
          source_kind: 'outgoing_delivery_queue_row',
          source_id: '11',
          severity_at_archive: 'dead',
          summary_json: { queue_kind: 'message.send' },
        },
      ],
    });

    const result = await pgHealthFailureArchivePort.listForAdmin({
      probe: null,
      limit: 50,
      cursor: null,
    });

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        doctorUserId: null,
        rawErrorTruncated: null,
        summaryJson: { queue_kind: 'message.send' },
      }),
    );
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.[1]).toBe(
      'app.list_platform_health_failure_archive(text,integer,timestamp with time zone,uuid)',
    );
  });
});
