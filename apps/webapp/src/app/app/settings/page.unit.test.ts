import { beforeEach, describe, expect, it, vi } from 'vitest';

const organizationId: string = '11111111-1111-4111-8111-111111111111';
const otherOrganizationId: string = '55555555-5555-4555-8555-555555555555';

const fakes = vi.hoisted(() => ({
  requireOrganizationWorkspaceContext: vi.fn(),
  resolveCabinetAccess: vi.fn(),
  requireEntitlementForReadAction: vi.fn(),
  isMechanicIncluded: vi.fn(),
  getManagementState: vi.fn(),
  listSettingsByScope: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));
vi.mock('@bersoncare/db-principal', () => ({
  runWithDbClinicBillingPrincipal: vi.fn(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    orgEntitlements: {
      resolveCabinetAccess: fakes.resolveCabinetAccess,
    },
    orgBranding: {
      getManagementState: fakes.getManagementState,
    },
    systemSettings: {
      listSettingsByScope: fakes.listSettingsByScope,
    },
  }),
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  isMechanicIncluded: fakes.isMechanicIncluded,
  requireEntitlementForReadAction: fakes.requireEntitlementForReadAction,
}));
vi.mock('@/app-layer/guards/cabinetAccessGate', () => ({
  isCabinetEntryBlocked: () => false,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireOrganizationWorkspaceContext: fakes.requireOrganizationWorkspaceContext,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));
vi.mock('@/config/env', () => ({ env: { APP_BASE_URL: 'http://example.test' } }));
vi.mock('@/modules/system-settings/doctorTodayPreferences', () => ({
  parseDoctorTodayPreferences: () => ({
    visibleProactiveInsightKinds: [],
    peopleListMode: 'on_support',
  }),
}));
vi.mock('@/modules/system-settings/platformIntegrationAvailability', () => ({
  parsePlatformIntegrationAvailabilityEnvelope: () => ({
    version: 1,
    integrations: { google_calendar: false },
  }),
}));

const { default: SettingsPage } = await import('./page');

describe('settings organization branding read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let activePrincipalOrganizationId: string | null = null;

    fakes.requireOrganizationWorkspaceContext.mockResolvedValue({
      organizationId,
      session: {
        adminMode: false,
        user: {
          userId: '22222222-2222-4222-8222-222222222222',
          role: 'doctor',
          displayName: 'Администратор клиники A',
        },
      },
      membershipRole: 'admin',
      specialistId: '33333333-3333-4333-8333-333333333333',
      canManageOrganization: true,
    });
    fakes.resolveCabinetAccess.mockResolvedValue({ state: 'full_access' });
    fakes.requireEntitlementForReadAction.mockResolvedValue({ ok: false });
    fakes.isMechanicIncluded.mockResolvedValue(false);
    fakes.listSettingsByScope.mockResolvedValue([]);
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      async (
        workspace: { organizationId: string },
        _source: string,
        read: () => Promise<unknown>,
      ) => {
        activePrincipalOrganizationId = workspace.organizationId;
        try {
          return await read();
        } finally {
          activePrincipalOrganizationId = null;
        }
      },
    );
    fakes.getManagementState.mockImplementation(
      async (ctx: { organizationId: string; actorPlatformUserId: string }) => {
        if (activePrincipalOrganizationId === null) {
          throw new Error('org_branding_core_context_unavailable');
        }
        if (
          activePrincipalOrganizationId !== organizationId ||
          ctx.organizationId !== organizationId ||
          ctx.organizationId === otherOrganizationId
        ) {
          throw new Error('organization_principal_mismatch');
        }
        return {
          effective: {
            organizationId,
            core: { displayName: 'Клиника A', isActive: true },
            paid: { displayName: null, logoUrl: null },
            effectiveDisplayName: 'Клиника A',
            resolution: 'no_published_revision',
          },
          brandingVisible: true,
          brandingMutationAvailable: false,
          accessState: 'read_only',
          draft: null,
          published: null,
        };
      },
    );
  });

  it('reads clinic A branding inside its trusted workspace principal, including read-only state', async () => {
    await expect(SettingsPage({})).resolves.toBeTruthy();

    expect(fakes.withDoctorWorkspacePrincipal).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      'app.settings.org-branding.read',
      expect.any(Function),
    );
    expect(fakes.getManagementState).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
    );
  });
});
