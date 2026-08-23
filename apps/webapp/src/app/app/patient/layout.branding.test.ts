import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SURFACE_AUTH_POLICY_CONFIG } from '@/shared/lib/surface/requestSurface';

const fakes = vi.hoisted(() => ({
  headers: vi.fn(),
  getCurrentSession: vi.fn(),
  buildAppDeps: vi.fn(),
  resolvePatientOrganizationRequestContext: vi.fn(),
  stampPatientOrganizationRequestContext: vi.fn(),
  withPatientOrganizationPrincipal: vi.fn(),
  getResolvedSurface: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: fakes.headers }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/app-layer/platform-access', () => ({ patientClientBusinessGate: vi.fn() }));
vi.mock('@/modules/platform-access', () => ({
  patientPathRequiresBoundPhone: vi.fn(() => false),
  resolvePatientLayoutPathname: vi.fn(() => '/app/patient'),
}));
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/env')>()),
  webappRuntimeDatabaseIsConfigured: vi.fn(() => false),
}));
vi.mock('@/modules/auth/service', () => ({ getCurrentSession: fakes.getCurrentSession }));
vi.mock('@/modules/roles/service', () => ({ canAccessPatient: vi.fn(() => true) }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/modules/system-settings/patientMaintenance', () => ({
  getPatientMaintenanceConfig: vi.fn(async () => ({ enabled: false })),
  patientMaintenanceReplacesPatientShell: vi.fn(() => false),
  patientMaintenanceSkipsPath: vi.fn(() => true),
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  getAuthChannelPolicy: vi.fn(async () => ({})),
}));
vi.mock('@/app-layer/guards/cabinetAccessGate', () => ({
  isCabinetEntryBlocked: vi.fn(() => false),
}));
vi.mock('@/app-layer/patient-organization/requestContext', () => ({
  resolvePatientOrganizationRequestContext: fakes.resolvePatientOrganizationRequestContext,
  stampPatientOrganizationRequestContext: fakes.stampPatientOrganizationRequestContext,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientOrganizationPrincipal: fakes.withPatientOrganizationPrincipal,
}));
vi.mock('@/shared/lib/surface/requestSurface.server', () => ({
  getResolvedSurface: fakes.getResolvedSurface,
}));

let PatientLayout: typeof import('./layout').default;

const organizationId = '11111111-1111-4111-8111-111111111111';
const platformUserId = '22222222-2222-4222-8222-222222222222';

beforeAll(async () => {
  ({ default: PatientLayout } = await import('./layout'));
});

beforeEach(() => {
  vi.clearAllMocks();
  fakes.headers.mockResolvedValue(new Headers());
  fakes.getCurrentSession.mockResolvedValue({
    user: { userId: platformUserId, role: 'client', phone: '+79990000000' },
  });
  fakes.buildAppDeps.mockReturnValue({
    runtimeConfig: { getServerBoolean: vi.fn(async () => false) },
    orgEntitlements: {
      resolveCabinetAccess: vi.fn(async () => ({ state: 'full_access' })),
    },
    orgBranding: {
      resolveEffectiveOrgBranding: vi.fn(async () => ({
        effectiveDisplayName: 'Дмитрий Берсон',
      })),
    },
  });
  fakes.resolvePatientOrganizationRequestContext.mockResolvedValue({
    ok: true,
    organizationId,
    organization: { id: organizationId, title: 'Точка Здоровья' },
    selectedBy: 'only_active',
  });
  fakes.withPatientOrganizationPrincipal.mockImplementation(
    async (_context: unknown, action: () => Promise<unknown>) => action(),
  );
  fakes.getResolvedSurface.mockResolvedValue({
    surface: 'patient_default',
    publicOrigin: 'https://therapygo.ru',
    authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
  });
});

describe('patient layout branding fallback', () => {
  it('keeps the published patient-principal brand when the current surface has none', async () => {
    const layout = await PatientLayout({ children: null });

    expect(layout).toMatchObject({
      props: { organizationContext: { organization: { title: 'Дмитрий Берсон' } } },
    });
    expect(fakes.withPatientOrganizationPrincipal).toHaveBeenCalledWith(
      {
        organizationId,
        platformUserId,
        source: 'app.patient.layout.org-branding',
      },
      expect.any(Function),
    );
  });

  it('uses the Host brand and does not resolve it again under the patient principal', async () => {
    fakes.getResolvedSurface.mockResolvedValue({
      surface: 'patient_branded',
      publicOrigin: 'https://clinic-a.therapygo.ru',
      organizationId,
      authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
      effectivePatientBrand: {
        effectiveDisplayName: 'Клиника на Host',
        patientAppName: 'Приложение клиники',
        accentToken: '#7a3cc2',
      },
    });

    const layout = await PatientLayout({ children: null });

    expect(layout).toMatchObject({
      props: { organizationContext: { organization: { title: 'Клиника на Host' } } },
    });
    expect(fakes.withPatientOrganizationPrincipal).not.toHaveBeenCalled();
  });
});
