import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

const fakes = vi.hoisted(() => ({
  resolveActiveOrganizationByHostname: vi.fn(),
  readAnonymousPatientSurfaceProjection: vi.fn(),
  resolveOrganizationIdBySlug: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    customDomainBinding: {
      resolveActiveOrganizationByHostname: fakes.resolveActiveOrganizationByHostname,
      readAnonymousPatientSurfaceProjection: fakes.readAnonymousPatientSurfaceProjection,
    },
    clinicDirectory: {
      resolveOrganizationIdBySlug: fakes.resolveOrganizationIdBySlug,
    },
  }),
}));

function requestFor(origin: string, pathname = '/app/patient/login'): NextRequest {
  return new NextRequest(new URL(pathname, origin), {
    headers: { host: new URL(origin).host, 'x-forwarded-proto': 'https' },
  });
}

async function loadRuntime() {
  vi.resetModules();
  vi.stubEnv('APP_BASE_URL', 'https://therapysto.test');
  vi.stubEnv('PATIENT_APP_ORIGIN', 'https://therapygo.test');
  const [proxyModule, surfaceModule] = await Promise.all([
    import('@/proxy'),
    import('@/shared/lib/surface/requestSurface'),
  ]);
  return { proxy: proxyModule.proxy, readResolvedSurface: surfaceModule.readResolvedSurface };
}

function projection(activeCustomDomainHostname?: string) {
  return {
    clinicSlug: 'known-clinic',
    skipPublicCardAtRoot: false,
    effectiveDisplayName: 'Known Clinic',
    patientAppName: 'Known Clinic',
    accentToken: '#284da0',
    ...(activeCustomDomainHostname ? { activeCustomDomainHostname } : {}),
  };
}

function resolvedSurfaceFrom(
  response: Response,
  readResolvedSurface: Awaited<ReturnType<typeof loadRuntime>>['readResolvedSurface'],
) {
  return readResolvedSurface({
    get: (name) => response.headers.get(`x-middleware-request-${name}`),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.resolveActiveOrganizationByHostname.mockResolvedValue(null);
  fakes.resolveOrganizationIdBySlug.mockResolvedValue(null);
  fakes.readAnonymousPatientSurfaceProjection.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('production Host → tenant wiring', () => {
  it('uses the production lookup from the exported proxy with a real Next event-shaped second argument', async () => {
    fakes.resolveOrganizationIdBySlug.mockImplementation(async (slug: string) =>
      slug === 'known-clinic' ? ORGANIZATION_ID : null,
    );
    fakes.readAnonymousPatientSurfaceProjection.mockResolvedValue(projection());
    const runtime = await loadRuntime();

    const response = await runtime.proxy(
      requestFor('https://known-clinic.therapygo.test'),
      { waitUntil: vi.fn(), passThroughOnException: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(resolvedSurfaceFrom(response, runtime.readResolvedSurface)).toMatchObject({
      surface: 'patient_branded',
      organizationId: ORGANIZATION_ID,
      clinicSlug: 'known-clinic',
      effectivePatientBrand: {
        effectiveDisplayName: 'Known Clinic',
        patientAppName: 'Known Clinic',
      },
    });
    expect(fakes.resolveOrganizationIdBySlug).toHaveBeenCalledWith('known-clinic');
  });

  it('hard-404s an unknown host through the same exported production path', async () => {
    const runtime = await loadRuntime();

    const response = await runtime.proxy(
      requestFor('https://unknown.example.test', '/app'),
      { waitUntil: vi.fn(), passThroughOnException: vi.fn() },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(resolvedSurfaceFrom(response, runtime.readResolvedSurface)).toBeNull();
  });

  it('hard-404s a known slug when the production projection rejects an inactive organization', async () => {
    fakes.resolveOrganizationIdBySlug.mockResolvedValue(ORGANIZATION_ID);
    fakes.readAnonymousPatientSurfaceProjection.mockResolvedValue(null);
    const runtime = await loadRuntime();

    const response = await runtime.proxy(
      requestFor('https://known-clinic.therapygo.test', '/app/patient/login'),
      { waitUntil: vi.fn(), passThroughOnException: vi.fn() },
    );

    expect(response.status).toBe(404);
    expect(resolvedSurfaceFrom(response, runtime.readResolvedSurface)).toBeNull();
  });

  it('resolves an active custom hostname only to the organization returned by the immutable binding seam', async () => {
    fakes.resolveActiveOrganizationByHostname.mockImplementation(async (hostname: string) =>
      hostname === 'app.known-clinic.test' ? ORGANIZATION_ID : null,
    );
    fakes.readAnonymousPatientSurfaceProjection.mockResolvedValue(projection());
    const runtime = await loadRuntime();

    const active = await runtime.proxy(requestFor('https://app.known-clinic.test'));
    const inactive = await runtime.proxy(requestFor('https://pending.known-clinic.test'));

    expect(resolvedSurfaceFrom(active, runtime.readResolvedSurface)).toMatchObject({
      surface: 'patient_branded',
      organizationId: ORGANIZATION_ID,
    });
    expect(inactive.status).toBe(404);
  });

  it('308-redirects the technical slug only after the projection reports an active custom hostname', async () => {
    fakes.resolveOrganizationIdBySlug.mockResolvedValue(ORGANIZATION_ID);
    fakes.readAnonymousPatientSurfaceProjection.mockResolvedValue(
      projection('app.known-clinic.test'),
    );
    const runtime = await loadRuntime();

    const response = await runtime.proxy(
      requestFor(
        'https://known-clinic.therapygo.test',
        '/app/patient/profile?tab=security&next=%2Fsetup',
      ),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://app.known-clinic.test/app/patient/profile?tab=security&next=%2Fsetup',
    );
  });

  it('keeps the technical slug live while no active custom hostname is projected', async () => {
    fakes.resolveOrganizationIdBySlug.mockResolvedValue(ORGANIZATION_ID);
    fakes.readAnonymousPatientSurfaceProjection.mockResolvedValue(projection());
    const runtime = await loadRuntime();

    const response = await runtime.proxy(
      requestFor('https://known-clinic.therapygo.test', '/app/patient/login?next=%2Fsetup'),
    );

    expect(response.status).toBe(200);
    expect(resolvedSurfaceFrom(response, runtime.readResolvedSurface)).toMatchObject({
      surface: 'patient_branded',
      organizationId: ORGANIZATION_ID,
    });
  });

  it('preserves the established platform host surfaces', async () => {
    const runtime = await loadRuntime();

    const [staff, admin, patient] = await Promise.all([
      runtime.proxy(requestFor('https://therapysto.test', '/app/doctor/login')),
      runtime.proxy(requestFor('https://admin.therapysto.test', '/app/admin/login')),
      runtime.proxy(requestFor('https://therapygo.test', '/app/patient/login')),
    ]);

    expect(resolvedSurfaceFrom(staff, runtime.readResolvedSurface)?.surface).toBe('staff');
    expect(resolvedSurfaceFrom(admin, runtime.readResolvedSurface)?.surface).toBe('platform_admin');
    expect(resolvedSurfaceFrom(patient, runtime.readResolvedSurface)?.surface).toBe(
      'patient_default',
    );
  });
});
