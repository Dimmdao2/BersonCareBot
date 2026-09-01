import { beforeEach, describe, expect, it, vi } from 'vitest';

// W8 (SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md): restores the genuine coverage loss for
// the patient-package sessions list route. Oracle: the removed `route.test.ts`
// (commit a380533b4dca81f6502f2688881694715e1ae7bd) plus the current `route.ts` source, which
// still (a) org-scopes the list by `gate.ctx.organizationId` and (b) threads `includePast` from the
// query string independently from the `allowPastUnlink` system setting. Testing through the real
// exported `GET` handler (not the guard/service directly) is what actually proves the route wires
// its own auth gate and setting lookup — calling the service function alone would not.

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const listPatientPackageSessionsMock = vi.hoisted(() => vi.fn());
const getSettingMock = vi.hoisted(() => vi.fn());

vi.mock('../../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    memberships: { listPatientPackageSessions: listPatientPackageSessionsMock },
    systemSettings: { getSetting: getSettingMock },
  }),
}));

import { GET } from './route';

const PKG_ID = '550e8400-e29b-41d4-a716-446655440010';
const ORG_ID = '11111111-1111-4111-8111-111111111111';

describe('GET /api/doctor/booking-engine/patient-packages/[id]/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG_ID, session: { user: { userId: 'u1' } } },
    });
    getSettingMock.mockResolvedValue({ valueJson: false });
    listPatientPackageSessionsMock.mockResolvedValue([]);
  });

  it('scopes the list to the caller organization and defaults includePast to false', async () => {
    const res = await GET(new Request('http://localhost/sessions'), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    expect(res.status).toBe(200);
    expect(listPatientPackageSessionsMock).toHaveBeenCalledWith(PKG_ID, ORG_ID, {
      includePast: false,
      allowPastUnlink: false,
    });
  });

  it('passes includePast=true from the query string independently of the unlink setting', async () => {
    getSettingMock.mockResolvedValue({ valueJson: false });
    await GET(new Request('http://localhost/sessions?includePast=true'), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    expect(listPatientPackageSessionsMock).toHaveBeenCalledWith(PKG_ID, ORG_ID, {
      includePast: true,
      allowPastUnlink: false,
    });
  });

  it('derives allowPastUnlink from the admin system setting, not the query string', async () => {
    getSettingMock.mockResolvedValue({ valueJson: true });
    await GET(new Request('http://localhost/sessions?includePast=false'), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    expect(getSettingMock).toHaveBeenCalledWith(
      'booking_allow_doctor_unlink_past_package_sessions',
      'admin',
    );
    expect(listPatientPackageSessionsMock).toHaveBeenCalledWith(PKG_ID, ORG_ID, {
      includePast: false,
      allowPastUnlink: true,
    });
  });

  it('does not list sessions when the doctor booking-engine gate rejects', async () => {
    const denied = new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 });
    requireDoctorBookingEngineMock.mockResolvedValue({ ok: false, response: denied });

    const res = await GET(new Request('http://localhost/sessions'), {
      params: Promise.resolve({ id: PKG_ID }),
    });

    expect(res.status).toBe(403);
    expect(listPatientPackageSessionsMock).not.toHaveBeenCalled();
  });
});
