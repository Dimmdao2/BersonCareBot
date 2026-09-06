import { beforeEach, describe, expect, it, vi } from 'vitest';

// Route contract: the patient-package sessions list stays scoped to the caller organization and
// threads `includePast` from the query string through the real exported GET handler.

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const listPatientPackageSessionsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    memberships: { listPatientPackageSessions: listPatientPackageSessionsMock },
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
    listPatientPackageSessionsMock.mockResolvedValue([]);
  });

  it('scopes the list to the caller organization and defaults includePast to false', async () => {
    const res = await GET(new Request('http://localhost/sessions'), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    expect(res.status).toBe(200);
    expect(listPatientPackageSessionsMock).toHaveBeenCalledWith(PKG_ID, ORG_ID, {
      includePast: false,
    });
  });

  it('passes includePast=true from the query string', async () => {
    await GET(new Request('http://localhost/sessions?includePast=true'), {
      params: Promise.resolve({ id: PKG_ID }),
    });
    expect(listPatientPackageSessionsMock).toHaveBeenCalledWith(PKG_ID, ORG_ID, {
      includePast: true,
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
