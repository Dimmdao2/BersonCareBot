import { describe, expect, it, vi, beforeEach } from 'vitest';

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const recalcPastSessionsForPackageMock = vi.hoisted(() => vi.fn());
const getAppointmentMock = vi.hoisted(() => vi.fn());
const emitPackageLinkedCalendarSyncMock = vi.hoisted(() => vi.fn());
const membershipsModuleEnabled = vi.hoisted(() => ({ value: true }));

vi.mock('../../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    memberships: membershipsModuleEnabled.value
      ? { recalcPastSessionsForPackage: recalcPastSessionsForPackageMock }
      : null,
  }),
}));

vi.mock('@/modules/integrator/bookingM2mApi', () => ({
  createBookingSyncPort: () => ({}),
}));

vi.mock('@/app-layer/booking/emitPackageCalendarSync', () => ({
  emitPackageLinkedCalendarSync: emitPackageLinkedCalendarSyncMock,
}));

import { POST } from './route';

const PKG_ID = '550e8400-e29b-41d4-a716-446655440010';
const APPT_ID_1 = '660e8400-e29b-41d4-a716-446655440020';
const APPT_ID_2 = '770e8400-e29b-41d4-a716-446655440030';

const makeGate = () => ({
  ok: true as const,
  ctx: {
    organizationId: 'org-1',
    session: { user: { userId: 'u1' } },
    service: { getAppointment: getAppointmentMock },
  },
});

function req() {
  return new Request('http://localhost/recalc', { method: 'POST' });
}

describe('POST patient-packages/[id]/recalc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipsModuleEnabled.value = true;
    requireDoctorBookingEngineMock.mockResolvedValue(makeGate());
    emitPackageLinkedCalendarSyncMock.mockResolvedValue('ok');
  });

  it('happy-path: returns full summary and triggers calendar sync for each debited appointment', async () => {
    const fakeAppt1 = { id: APPT_ID_1, status: 'completed' };
    const fakeAppt2 = { id: APPT_ID_2, status: 'completed' };
    const summary = {
      patientPackageId: PKG_ID,
      debited: [
        {
          appointmentId: APPT_ID_1,
          patientPackageItemId: 'item-1',
          serviceId: 'svc-1',
          usageId: 'usage-1',
        },
        {
          appointmentId: APPT_ID_2,
          patientPackageItemId: 'item-2',
          serviceId: 'svc-1',
          usageId: 'usage-2',
        },
      ],
      skipped: [{ appointmentId: 'appt-3', serviceId: 'svc-1', reason: 'already_debited' }],
      outOfBalance: [{ appointmentId: 'appt-4', serviceId: 'svc-1' }],
      corrected: [{ appointmentId: 'appt-5', serviceId: 'svc-1', refundUsageId: 'refund-1' }],
    };
    recalcPastSessionsForPackageMock.mockResolvedValue(summary);
    getAppointmentMock.mockResolvedValueOnce(fakeAppt1).mockResolvedValueOnce(fakeAppt2);

    const res = await POST(req(), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    const json = (await res.json()) as { ok: boolean; summary: typeof summary };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.summary).toEqual(summary);
    expect(recalcPastSessionsForPackageMock).toHaveBeenCalledWith({
      organizationId: 'org-1',
      patientPackageId: PKG_ID,
      createdByPlatformUserId: 'u1',
    });
    expect(getAppointmentMock).toHaveBeenCalledTimes(2);
    expect(getAppointmentMock).toHaveBeenCalledWith(APPT_ID_1);
    expect(getAppointmentMock).toHaveBeenCalledWith(APPT_ID_2);
    expect(emitPackageLinkedCalendarSyncMock).toHaveBeenCalledTimes(2);
    expect(emitPackageLinkedCalendarSyncMock).toHaveBeenCalledWith({}, fakeAppt1);
    expect(emitPackageLinkedCalendarSyncMock).toHaveBeenCalledWith({}, fakeAppt2);
  });

  it('returns 403 when doctor role gate fails', async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 }),
    });

    const res = await POST(req(), {
      params: Promise.resolve({ id: PKG_ID }),
    });

    expect(res.status).toBe(403);
    expect(recalcPastSessionsForPackageMock).not.toHaveBeenCalled();
  });

  it('returns 503 when memberships module is unavailable', async () => {
    membershipsModuleEnabled.value = false;

    const res = await POST(req(), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    const json = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('memberships_unavailable');
  });

  it('idempotent repeat returns empty full summary and no calendar sync', async () => {
    const emptySummary = {
      patientPackageId: PKG_ID,
      debited: [],
      skipped: [],
      outOfBalance: [],
      corrected: [],
    };
    recalcPastSessionsForPackageMock.mockResolvedValue(emptySummary);

    const res = await POST(req(), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    const json = (await res.json()) as { ok: boolean; summary: typeof emptySummary };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.summary).toEqual(emptySummary);
    expect(getAppointmentMock).not.toHaveBeenCalled();
    expect(emitPackageLinkedCalendarSyncMock).not.toHaveBeenCalled();
  });

  it('maps a service error to 400', async () => {
    recalcPastSessionsForPackageMock.mockRejectedValue(new Error('package_not_found'));

    const res = await POST(req(), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ ok: false, error: 'package_not_found' });
  });
});
