import { describe, expect, it, vi } from 'vitest';

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const buildAppDepsMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: buildAppDepsMock,
}));

describe('doctor client history route', () => {
  const organizationId = '10000000-0000-4000-8000-000000000001';
  const patientId = 'a0000000-0000-4000-8000-000000000001';
  const canonicalPatientId = 'b0000000-0000-4000-8000-000000000002';

  it('GET returns timeline, payments and visits', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId, session: { user: { userId: 'doc-1', role: 'doctor' } } },
    });
    const getClientIdentityForOrganization = vi
      .fn()
      .mockResolvedValue({ userId: canonicalPatientId });
    const listTimeline = vi.fn().mockResolvedValue([{ id: 't1' }]);
    const listPaymentHistory = vi.fn().mockResolvedValue([{ id: 'p1' }]);
    const listVisitHistory = vi.fn().mockResolvedValue([{ appointmentId: 'a1' }]);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: {
        getClientIdentityForOrganization,
      },
      bookingEngine: {},
      clientHistory: { listTimeline, listPaymentHistory, listVisitHistory },
    });

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ userId: patientId }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      timeline?: unknown[];
      payments?: unknown[];
      visits?: unknown[];
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.timeline).toHaveLength(1);
    expect(json.payments).toHaveLength(1);
    expect(json.visits).toHaveLength(1);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(patientId, organizationId);
    expect(listTimeline).toHaveBeenCalledWith(organizationId, canonicalPatientId);
    expect(listPaymentHistory).toHaveBeenCalledWith(organizationId, canonicalPatientId);
    expect(listVisitHistory).toHaveBeenCalledWith(organizationId, canonicalPatientId);
  });

  it('GET returns 404 when client not found', async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId, session: { user: { userId: 'doc-1', role: 'doctor' } } },
    });
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      bookingEngine: {},
      clientHistory: {},
    });

    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ userId: patientId }),
    });
    expect(res.status).toBe(404);
  });
});
