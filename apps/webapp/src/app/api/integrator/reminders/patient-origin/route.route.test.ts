import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from '@/app/api/integrator/testUtils/wireAssertIntegratorGetForRouteTests';

const fakes = vi.hoisted(() => ({
  assertIntegratorGetRequest: vi.fn(),
  isVerifiedIntegratorOrganizationId: vi.fn(),
  resolvePatientPublicOrigin: vi.fn(),
}));

vi.mock('@/app-layer/integrator/assertIntegratorGetRequest', () => ({
  assertIntegratorGetRequest: fakes.assertIntegratorGetRequest,
}));
vi.mock('@/app-layer/principal/integratorOrganizationPrincipal', () => ({
  isVerifiedIntegratorOrganizationId: fakes.isVerifiedIntegratorOrganizationId,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    customDomainBinding: { resolvePatientPublicOrigin: fakes.resolvePatientPublicOrigin },
  }),
}));

import { GET } from './route';

const organizationId = '22222222-2222-4222-8222-222222222222';

function request(
  headers: HeadersInit = integratorGetSignedHeadersOk,
  requestedOrganizationId = organizationId,
) {
  const search = new URLSearchParams({ organizationId: requestedOrganizationId });
  return new Request(
    `https://staff.example.test/api/integrator/reminders/patient-origin?${search}`,
    {
      headers,
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  wireDefaultAssertIntegratorGetForRouteTests(fakes.assertIntegratorGetRequest);
  fakes.isVerifiedIntegratorOrganizationId.mockImplementation(
    (value: string) => value === organizationId,
  );
  fakes.resolvePatientPublicOrigin.mockResolvedValue('https://clinic.patient.example');
});

describe('signed reminder patient-origin boundary', () => {
  it('returns the webapp-owned patient origin for the signed canonical organization', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      patientPublicOrigin: 'https://clinic.patient.example',
    });
  });

  it('rejects an unsigned organization claim before origin resolution', async () => {
    const response = await GET(request({ cookie: `organizationId=${organizationId}` }));

    expect(response.status).toBe(400);
    expect(fakes.resolvePatientPublicOrigin).not.toHaveBeenCalled();
  });

  it('rejects an invalid organization identifier before origin resolution', async () => {
    const response = await GET(request(integratorGetSignedHeadersOk, 'not-an-organization-id'));

    expect(response.status).toBe(400);
    expect(fakes.resolvePatientPublicOrigin).not.toHaveBeenCalled();
  });

  it('fails closed when the organization has no resolvable patient origin', async () => {
    fakes.resolvePatientPublicOrigin.mockRejectedValue(new Error('unresolved'));

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'patient public origin unavailable',
    });
  });
});
