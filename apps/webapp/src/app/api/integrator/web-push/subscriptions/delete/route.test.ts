import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(() => true),
  enterOrg: vi.fn(() => true),
  patient: vi.fn(async () => false),
  staff: vi.fn(async () => false),
  deleteExact: vi.fn(async () => true),
}));

vi.mock('@/app-layer/integrator/verifyIntegratorSignature', () => ({
  verifyIntegratorSignature: mocks.verify,
}));
vi.mock('@/app-layer/principal/integratorOrganizationPrincipal', () => ({
  enterVerifiedIntegratorOrganizationPrincipal: mocks.enterOrg,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    patientOrganization: { hasActiveEnrollment: mocks.patient },
    organizationMembership: { hasActiveMembership: mocks.staff },
    webPushSubscriptions: { deleteByEndpointIfExists: mocks.deleteExact },
  }),
}));

import { POST } from './route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PUSH_USER_ID = '22222222-2222-4222-8222-222222222222';
const ENDPOINT = 'https://push.example/subscription';

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://test/api/integrator/web-push/subscriptions/delete', {
    method: 'POST',
    headers: { 'x-bersoncare-timestamp': '1', 'x-bersoncare-signature': 'sig' },
    body: JSON.stringify({
      organizationId: ORGANIZATION_ID,
      pushUserId: PUSH_USER_ID,
      endpoint: ENDPOINT,
      ...overrides,
    }),
  });
}

describe('integrator web-push exact subscription deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockReturnValue(true);
    mocks.enterOrg.mockReturnValue(true);
    mocks.patient.mockResolvedValue(false);
    mocks.staff.mockResolvedValue(false);
  });

  it('denies a cross-organization endpoint attack before deletion', async () => {
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.patient).toHaveBeenCalledWith(PUSH_USER_ID, ORGANIZATION_ID);
    expect(mocks.staff).toHaveBeenCalledWith(PUSH_USER_ID, ORGANIZATION_ID);
    expect(mocks.deleteExact).not.toHaveBeenCalled();
  });

  it('deletes atomically by exact staff user and endpoint', async () => {
    mocks.staff.mockResolvedValue(true);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.deleteExact).toHaveBeenCalledWith(PUSH_USER_ID, ENDPOINT);
  });

  it('deletes atomically for an active patient enrollment', async () => {
    mocks.patient.mockResolvedValue(true);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.deleteExact).toHaveBeenCalledWith(PUSH_USER_ID, ENDPOINT);
  });
});
