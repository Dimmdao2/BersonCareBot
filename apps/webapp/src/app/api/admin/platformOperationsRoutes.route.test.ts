import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requirePlatformOperationsApiContext: vi.fn(),
  getPool: vi.fn(),
  listAdminAuditLog: vi.fn(),
  countOpenAutoMergeConflicts: vi.fn(),
  resolveAdminAuditConflictById: vi.fn(),
  writeAuditLog: vi.fn(),
  buildAppDeps: vi.fn(),
  clearDeadForProbe: vi.fn(),
  acknowledgeOpenOutboundProviderIncidents: vi.fn(),
  resolveAllOpenIncidents: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));
vi.mock('@/app-layer/db/client', () => ({ getPool: fakes.getPool }));
vi.mock('@/app-layer/admin/auditLog', () => ({
  listAdminAuditLog: fakes.listAdminAuditLog,
  countOpenAutoMergeConflicts: fakes.countOpenAutoMergeConflicts,
  resolveAdminAuditConflictById: fakes.resolveAdminAuditConflictById,
  writeAuditLog: fakes.writeAuditLog,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { info: fakes.loggerInfo } }));

import { GET as listAuditLog } from './audit-log/route';
import { POST as resolveAuditLog } from './audit-log/resolve/route';
import { POST as clearHealthArchive } from './health-failure-archive/clear/route';
import { POST as acknowledgeIncidents } from './operator-incidents/acknowledge-all/route';
import { POST as resolveIncidents } from './operator-incidents/resolve-all/route';

const PLATFORM_USER_ID = '00000000-0000-4000-8000-000000000101';
const AUDIT_ROW_ID = '00000000-0000-4000-8000-000000000102';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePlatformOperationsApiContext.mockResolvedValue({
    ok: true,
    session: { user: { userId: PLATFORM_USER_ID } },
  });
  fakes.getPool.mockReturnValue({ kind: 'pool' });
  fakes.listAdminAuditLog.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });
  fakes.countOpenAutoMergeConflicts.mockResolvedValue(0);
  fakes.resolveAdminAuditConflictById.mockResolvedValue({ ok: true });
  fakes.writeAuditLog.mockResolvedValue(undefined);
  fakes.clearDeadForProbe.mockResolvedValue({ inserted: 2, deleted: 2 });
  fakes.acknowledgeOpenOutboundProviderIncidents.mockResolvedValue({ acknowledged: 3 });
  fakes.resolveAllOpenIncidents.mockResolvedValue({ resolved: 4 });
  fakes.buildAppDeps.mockReturnValue({
    healthFailureArchive: { clearDeadForProbe: fakes.clearDeadForProbe },
    operatorHealthWrite: {
      acknowledgeOpenOutboundProviderIncidents:
        fakes.acknowledgeOpenOutboundProviderIncidents,
      resolveAllOpenIncidents: fakes.resolveAllOpenIncidents,
    },
  });
});

describe('platform operations routes', () => {
  it('stops every platform operation at the platform gate', async () => {
    const denied = NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    fakes.requirePlatformOperationsApiContext.mockResolvedValue({ ok: false, response: denied });

    const responses = await Promise.all([
      listAuditLog(new Request('http://localhost/api/admin/audit-log')),
      resolveAuditLog(
        new Request('http://localhost/api/admin/audit-log/resolve', {
          method: 'POST',
          body: JSON.stringify({ id: AUDIT_ROW_ID }),
        }),
      ),
      clearHealthArchive(
        new Request('http://localhost/api/admin/health-failure-archive/clear', {
          method: 'POST',
          body: JSON.stringify({ probe: 'outgoing_delivery' }),
        }),
      ),
      acknowledgeIncidents(),
      resolveIncidents(),
    ]);

    expect(responses).toEqual([denied, denied, denied, denied, denied]);
    expect(fakes.requirePlatformOperationsApiContext).toHaveBeenCalledTimes(5);
    expect(fakes.getPool).not.toHaveBeenCalled();
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
    expect(fakes.writeAuditLog).not.toHaveBeenCalled();
  });

  it('runs audit reads and conflict resolution under the platform principal', async () => {
    const listResponse = await listAuditLog(new Request('http://localhost/api/admin/audit-log'));
    const resolveResponse = await resolveAuditLog(
      new Request('http://localhost/api/admin/audit-log/resolve', {
        method: 'POST',
        body: JSON.stringify({ id: AUDIT_ROW_ID }),
      }),
    );

    expect(listResponse.status).toBe(200);
    expect(resolveResponse.status).toBe(200);
    expect(fakes.listAdminAuditLog).toHaveBeenCalledTimes(1);
    expect(fakes.resolveAdminAuditConflictById).toHaveBeenCalledWith(
      { kind: 'pool' },
      AUDIT_ROW_ID,
    );
    expect(fakes.requirePlatformOperationsApiContext).toHaveBeenCalledTimes(2);
  });

  it('runs global health mutations and records their platform actor', async () => {
    const archiveResponse = await clearHealthArchive(
      new Request('http://localhost/api/admin/health-failure-archive/clear', {
        method: 'POST',
        body: JSON.stringify({ probe: 'outgoing_delivery' }),
      }),
    );
    const acknowledgeResponse = await acknowledgeIncidents();
    const resolveResponse = await resolveIncidents();

    expect([archiveResponse.status, acknowledgeResponse.status, resolveResponse.status]).toEqual([
      200, 200, 200,
    ]);
    expect(fakes.clearDeadForProbe).toHaveBeenCalledWith({
      probe: 'outgoing_delivery',
      archivedByUserId: PLATFORM_USER_ID,
    });
    expect(fakes.acknowledgeOpenOutboundProviderIncidents).toHaveBeenCalledTimes(1);
    expect(fakes.resolveAllOpenIncidents).toHaveBeenCalledTimes(1);
    expect(fakes.writeAuditLog).toHaveBeenCalledTimes(3);
    expect(fakes.writeAuditLog).toHaveBeenCalledWith(
      { kind: 'pool' },
      expect.objectContaining({ actorId: PLATFORM_USER_ID }),
    );
  });
});
