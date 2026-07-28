import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireEntitlementMock = vi.hoisted(() => vi.fn());
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: requireEntitlementMock,
}));

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback()),
);
const listScheduleBlocksMock = vi.hoisted(() => vi.fn());
const createScheduleBlockMock = vi.hoisted(() => vi.fn());
const deleteScheduleBlockMock = vi.hoisted(() => vi.fn());

vi.mock('../_requireAdminBookingEngine', () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      listScheduleBlocks: listScheduleBlocksMock,
      createScheduleBlock: createScheduleBlockMock,
      deleteScheduleBlock: deleteScheduleBlockMock,
    },
  }),
}));

import { DELETE, GET, POST } from './route';

describe('/api/admin/booking-engine/schedule-blocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      async (_ctx: unknown, _source: string, callback: () => Promise<unknown>) => callback(),
    );
    requireEntitlementMock.mockReset();
    requireEntitlementMock.mockResolvedValue({ ok: true });
  });

  it('GET passes scope filters to listScheduleBlocks', async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: 'org-1' },
    });
    listScheduleBlocksMock.mockResolvedValue([]);

    const res = await GET(
      new Request(
        'http://localhost/api/admin/booking-engine/schedule-blocks?specialistId=11111111-1111-4111-8111-111111111111&branchId=22222222-2222-4222-8222-222222222222',
      ),
    );
    const json = (await res.json()) as { ok?: boolean; blocks?: unknown[] };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(listScheduleBlocksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        specialistId: '11111111-1111-4111-8111-111111111111',
        branchId: '22222222-2222-4222-8222-222222222222',
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it('POST creates scoped schedule block', async () => {
    const gateCtx = { organizationId: 'org-1', session: { user: { userId: 'user-1' } } };
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: gateCtx,
    });
    createScheduleBlockMock.mockResolvedValue({ id: 'block-1' });

    const res = await POST(
      new Request('http://localhost/api/admin/booking-engine/schedule-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialistId: '11111111-1111-4111-8111-111111111111',
          startAt: '2026-06-01T09:00:00.000Z',
          endAt: '2026-06-01T10:00:00.000Z',
          blockType: 'block',
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      gateCtx,
      'admin.booking-engine.schedule-blocks.create',
      expect.any(Function),
    );
    expect(createScheduleBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        specialistId: '11111111-1111-4111-8111-111111111111',
        blockType: 'block',
        createdByActorId: 'user-1',
      }),
    );
  });

  it('denies booking entitlement after auth without creating a schedule block', async () => {
    const { NextResponse } = await import('next/server');
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: 'org-1', session: { user: { userId: 'user-1' } } },
    });
    requireEntitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'entitlement_required', mechanic: 'booking' },
        { status: 403 },
      ),
    });

    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }),
    );

    expect(res.status).toBe(403);
    expect(createScheduleBlockMock).not.toHaveBeenCalled();
    expect(requireAdminBookingEngineMock.mock.invocationCallOrder[0]).toBeLessThan(
      requireEntitlementMock.mock.invocationCallOrder[0]!,
    );
  });

  it('DELETE deletes scoped schedule block', async () => {
    const gateCtx = { organizationId: 'org-1', session: { user: { userId: 'user-1' } } };
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: gateCtx,
    });
    deleteScheduleBlockMock.mockResolvedValue(undefined);

    const res = await DELETE(
      new Request(
        'http://localhost/api/admin/booking-engine/schedule-blocks?id=33333333-3333-4333-8333-333333333333',
        { method: 'DELETE' },
      ),
    );

    expect(res.status).toBe(200);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      gateCtx,
      'admin.booking-engine.schedule-blocks.delete',
      expect.any(Function),
    );
    expect(deleteScheduleBlockMock).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      'org-1',
    );
    expect(requireEntitlementMock).toHaveBeenCalledWith(gateCtx, 'booking');
  });

  it.each([
    ['read_only', 'commercial_read_only'],
    ['blocked', 'commercial_blocked'],
  ] as const)(
    'DELETE denies schedule-block mutation when the organization lifecycle is %s',
    async (_lifecycle, error) => {
      const { NextResponse } = await import('next/server');
      const gateCtx = { organizationId: 'org-1', session: { user: { userId: 'user-1' } } };
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: gateCtx });
      requireEntitlementMock.mockResolvedValueOnce({
        ok: false,
        response: NextResponse.json({ ok: false, error, mechanic: 'booking' }, { status: 403 }),
      });

      const res = await DELETE(
        new Request(
          'http://localhost/api/admin/booking-engine/schedule-blocks?id=33333333-3333-4333-8333-333333333333',
          { method: 'DELETE' },
        ),
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ error, mechanic: 'booking' });
      expect(requireEntitlementMock).toHaveBeenCalledWith(gateCtx, 'booking');
      expect(deleteScheduleBlockMock).not.toHaveBeenCalled();
      expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    },
  );

  it('DELETE rejects missing id before principal wrapper', async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: 'org-1', session: { user: { userId: 'user-1' } } },
    });

    const res = await DELETE(
      new Request('http://localhost/api/admin/booking-engine/schedule-blocks', {
        method: 'DELETE',
      }),
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };

    expect(res.status).toBe(400);
    expect(json).toEqual({ ok: false, error: 'missing_id' });
    expect(deleteScheduleBlockMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });
});
