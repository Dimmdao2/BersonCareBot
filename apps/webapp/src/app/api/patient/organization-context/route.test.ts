import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const patientClientBusinessGateMock = vi.hoisted(() => vi.fn());
const resolveContextMock = vi.hoisted(() => vi.fn());
const cookieSetMock = vi.hoisted(() => vi.fn());
const cookieDeleteMock = vi.hoisted(() => vi.fn());
const cookieGetMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: cookieGetMock,
    set: cookieSetMock,
    delete: cookieDeleteMock,
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('@/modules/auth/service', () => ({ getCurrentSession: getCurrentSessionMock }));
vi.mock('@/app-layer/platform-access', () => ({
  patientClientBusinessGate: patientClientBusinessGateMock,
}));
vi.mock('@/app-layer/patient-organization/requestContext', () => ({
  resolvePatientOrganizationRequestContext: resolveContextMock,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ patientOrganization: {} }),
}));
vi.mock('@/modules/roles/service', () => ({ canAccessPatient: () => true }));

import { DELETE, GET, POST } from './route';

const PATIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_A = '11111111-1111-4111-8111-111111111111';

describe('patient organization context route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentSessionMock.mockResolvedValue({ user: { userId: PATIENT_ID, role: 'client' } });
    patientClientBusinessGateMock.mockResolvedValue('allow');
    cookieGetMock.mockReturnValue(undefined);
  });

  it('persists a target only after server-side enrollment verification', async () => {
    resolveContextMock.mockResolvedValue({
      ok: true,
      organizationId: ORG_A,
      organization: { organizationId: ORG_A, title: 'Клиника А' },
      organizations: [{ organizationId: ORG_A, title: 'Клиника А' }],
      selectedBy: 'verified_target',
    });

    const response = await POST(
      new Request('http://localhost/api/patient/organization-context', {
        method: 'POST',
        body: JSON.stringify({ organizationId: ORG_A }),
      }),
    );

    expect(response.status).toBe(200);
    expect(resolveContextMock).toHaveBeenCalledWith(expect.anything(), PATIENT_ID, {
      rememberedOrganizationId: null,
      verifiedTargetOrganizationId: ORG_A,
    });
    expect(cookieSetMock).toHaveBeenCalledWith(
      'bc_patient_organization',
      ORG_A,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/app/patient', 'layout');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(cookieDeleteMock).toHaveBeenCalledWith('bc_patient_organization_change_receipt');
  });

  it('consumes a verified opener receipt once and never repeats it', async () => {
    let receipt: string | undefined = ORG_A;
    cookieGetMock.mockImplementation((name: string) =>
      name === 'bc_patient_organization_change_receipt' && receipt ? { value: receipt } : undefined,
    );
    cookieDeleteMock.mockImplementation((name: string) => {
      if (name === 'bc_patient_organization_change_receipt') receipt = undefined;
    });
    resolveContextMock.mockResolvedValue({
      ok: true,
      organizationId: ORG_A,
      organization: { organizationId: ORG_A, title: 'Клиника А' },
      organizations: [{ organizationId: ORG_A, title: 'Клиника А' }],
      selectedBy: 'remembered',
    });

    const first = await GET();
    const second = await GET();
    await expect(first.json()).resolves.toMatchObject({ contextChanged: true });
    await expect(second.json()).resolves.toMatchObject({ contextChanged: false });
    expect(cookieDeleteMock).toHaveBeenCalledWith('bc_patient_organization_change_receipt');
  });

  it('rejects a revoked or foreign target without changing preference', async () => {
    resolveContextMock.mockResolvedValue({
      ok: false,
      reason: 'organization_target_not_authorized',
    });
    const response = await POST(
      new Request('http://localhost/api/patient/organization-context', {
        method: 'POST',
        body: JSON.stringify({ organizationId: ORG_A }),
      }),
    );
    expect(response.status).toBe(403);
    expect(cookieSetMock).not.toHaveBeenCalled();
    expect(cookieDeleteMock).toHaveBeenCalledWith('bc_patient_organization_change_receipt');
  });

  it('clears a stale remembered context and invalidates patient caches', async () => {
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(cookieDeleteMock).toHaveBeenCalledWith('bc_patient_organization');
    expect(revalidatePathMock).toHaveBeenCalledWith('/app/patient', 'layout');
  });
});
