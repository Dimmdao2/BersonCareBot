import { describe, expect, it, vi, beforeEach } from 'vitest';

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const recalcPastSessionsForPackageDbPhaseMock = vi.hoisted(() => vi.fn());
const refreshRecalcPastSessionsCalendarMock = vi.hoisted(() => vi.fn());
const membershipsModuleEnabled = vi.hoisted(() => ({ value: true }));
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(
    async <T>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
      principalState.inside = true;
      try {
        return await fn();
      } finally {
        principalState.inside = false;
      }
    },
  ),
);

vi.mock('../../../_requireAdminBookingEngine', () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    memberships: membershipsModuleEnabled.value
      ? {
          recalcPastSessionsForPackageDbPhase: recalcPastSessionsForPackageDbPhaseMock,
          refreshRecalcPastSessionsCalendar: refreshRecalcPastSessionsCalendarMock,
        }
      : null,
  }),
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { POST } from './route';

const PKG_ID = '550e8400-e29b-41d4-a716-446655440010';
const APPT_ID_1 = '660e8400-e29b-41d4-a716-446655440020';

const makeGate = () => ({
  ok: true as const,
  ctx: {
    organizationId: 'org-1',
    session: { user: { userId: 'admin-1', role: 'admin' } },
  },
});

describe('POST admin patient-packages/[id]/recalc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipsModuleEnabled.value = true;
    principalState.inside = false;
    requireAdminBookingEngineMock.mockResolvedValue(makeGate());
    refreshRecalcPastSessionsCalendarMock.mockResolvedValue(undefined);
  });

  it('happy-path: returns 200 with full summary object', async () => {
    const summary = {
      patientPackageId: PKG_ID,
      debited: [
        {
          appointmentId: APPT_ID_1,
          patientPackageItemId: 'item-1',
          serviceId: 'svc-1',
          usageId: 'usage-1',
        },
      ],
      skipped: [],
      outOfBalance: [],
    };
    recalcPastSessionsForPackageDbPhaseMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return { summary, appointmentsToRefresh: [APPT_ID_1] };
    });
    refreshRecalcPastSessionsCalendarMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
    });

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    const json = (await res.json()) as { ok: boolean; summary: typeof summary };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.summary).toEqual(summary);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      'admin.booking-engine.patient-packages.recalc',
      expect.any(Function),
    );
    expect(recalcPastSessionsForPackageDbPhaseMock).toHaveBeenCalledWith({
      organizationId: 'org-1',
      patientPackageId: PKG_ID,
      createdByPlatformUserId: 'admin-1',
    });
    expect(refreshRecalcPastSessionsCalendarMock).toHaveBeenCalledWith([APPT_ID_1]);
  });

  it('returns 401/403 when admin gate fails', async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
    });

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: PKG_ID }),
    });

    expect(res.status).toBe(403);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(recalcPastSessionsForPackageDbPhaseMock).not.toHaveBeenCalled();
    expect(refreshRecalcPastSessionsCalendarMock).not.toHaveBeenCalled();
  });

  it('returns 503 when memberships module is unavailable', async () => {
    membershipsModuleEnabled.value = false;

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    const json = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('memberships_unavailable');
  });

  it('returns 400 when service throws', async () => {
    recalcPastSessionsForPackageDbPhaseMock.mockRejectedValue(new Error('package_not_found'));

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    const json = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('package_not_found');
    expect(refreshRecalcPastSessionsCalendarMock).not.toHaveBeenCalled();
  });
});
