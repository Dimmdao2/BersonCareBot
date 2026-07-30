import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireEntitlementForMutation,
  requireEntitlementForPage,
  requireEntitlementForRead,
  resolveMechanicSurfaceVisibility,
} from '@/app-layer/guards/requireEntitlement';
import {
  createPlatformEntitlementsService,
  entitlementsFromSnapshot,
  fileStorageLimitFromSnapshot,
  resolveClinicSeatLimit,
  resolveMechanicAccessFromSnapshot,
  resolveOrgQuotaProjections,
} from '@/modules/org-entitlements/service';
import type {
  OrgEntitlementsPort,
  PlatformEntitlementsPort,
} from '@/modules/org-entitlements/ports';
import {
  MECHANICS,
  type MechanicDefinition,
  type OrgEntitlementSnapshot,
  type Tariff,
  type TariffQuotaMap,
} from '@/modules/org-entitlements/types';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const activeAccess = {
  lifecycle: 'active' as const,
  tariffId: 'tariff',
  source: 'assignment' as const,
};

const unconfiguredPolicies = {
  systemAccessPolicy: null,
  mechanicAccessPolicies: {},
  includedSeatsWarningAtPercent: null,
} as const;

function snapshotPort(): OrgEntitlementsPort {
  return {
    async getSnapshot() {
      return {
        tariff: {
          mechanics: {
            courses: true,
            files: true,
            patient_app: true,
            patient_card: false,
            clinic_team: false,
          },
          // Simulates a historical stored value which the stage-2 migration removes.
          quotas: {
            files: {
              kind: 'numeric',
              limit: 10,
              unit: 'bytes',
              warningAtPercent: null,
            },
            courses: {
              kind: 'numeric',
              limit: 1,
              unit: 'bytes',
              warningAtPercent: null,
            },
            patient_app: {
              kind: 'numeric',
              limit: 1,
              unit: 'bytes',
              warningAtPercent: null,
            },
          } as never,
          includedSeats: null,
          ...unconfiguredPolicies,
        },
        overrides: [
          {
            mechanic: 'patient_card',
            enabled: false,
            quota: null,
            expiresAt: null,
            seatLimitOverride: null,
          },
        ],
        access: activeAccess,
      };
    },
    async getTariffForOrg() {
      return null;
    },
    async listOverrides() {
      return [];
    },
    async getEffectiveCommercialAccess() {
      return activeAccess;
    },
    async getEnforcedQuotaUsage() {
      return { courses: 1, files: 5, patient_app: 1 };
    },
  };
}

describe('org entitlement mechanic classes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fed a historical courses number, does not project usage for a possibility mechanic', async () => {
    const projections = await resolveOrgQuotaProjections(snapshotPort(), 'org');

    expect(projections).toHaveLength(1);
    expect(projections[0]).toEqual(
      expect.objectContaining({
        mechanic: 'files',
        usage: 5,
        quota: expect.objectContaining({ limit: 10, unit: 'bytes' }),
      }),
    );
  });

  it('fed a historical patient-app number, does not project usage for a never mechanic', async () => {
    const projections = await resolveOrgQuotaProjections(snapshotPort(), 'org');

    expect(projections.map((projection) => projection.mechanic)).not.toContain('patient_app');
  });

  it('allows the patient-card mutation guard when stored tariff and override values are false', async () => {
    const port = snapshotPort();
    vi.mocked(buildAppDeps).mockReturnValue({ orgEntitlements: port } as ReturnType<
      typeof buildAppDeps
    >);
    const result = await requireEntitlementForMutation({ organizationId: 'org' }, 'patient_card');

    expect(result).toEqual({ ok: true });
  });

  it('keeps numeric mechanics enabled and resolves their configured limits from a new tariff', async () => {
    let storedTariff: Tariff | null = null;
    const platformPort: PlatformEntitlementsPort = {
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      createTariff: async (input) => {
        storedTariff = {
          ...input,
          id: 'tariff',
          createdAt: '2026-07-30T00:00:00.000Z',
          updatedAt: '2026-07-30T00:00:00.000Z',
        };
        return storedTariff;
      },
      updateTariff: async () => {
        throw new Error('not_used');
      },
      archiveTariff: async () => {},
      assignTariff: async () => {},
      upsertOverride: async () => {},
      deleteOverride: async () => {},
      setTrialPolicy: async () => {},
      startTrial: async () => null,
      extendTrial: async () => ({ endsAt: '2026-08-01T00:00:00.000Z' }),
    };
    const constructor = createPlatformEntitlementsService(platformPort);
    const tariff = await constructor.createTariff(
      {
        name: 'Новый',
        description: '',
        priceMinor: null,
        currency: null,
        billingPeriod: 'month',
        mechanics: Object.fromEntries(MECHANICS.map((mechanic) => [mechanic, false])),
        quotas: {
          files: {
            kind: 'numeric',
            limit: 1024,
            unit: 'bytes',
            warningAtPercent: null,
          },
        },
        systemAccessPolicy: null,
        mechanicAccessPolicies: {},
        includedSeats: 3,
        includedSeatsWarningAtPercent: null,
        isActive: true,
      },
      { actorId: 'admin', reason: '' },
    );
    const assignedPort: OrgEntitlementsPort = {
      getSnapshot: async () => ({
        tariff: {
          mechanics: tariff.mechanics,
          quotas: tariff.quotas,
          systemAccessPolicy: tariff.systemAccessPolicy,
          mechanicAccessPolicies: tariff.mechanicAccessPolicies,
          includedSeats: tariff.includedSeats,
          includedSeatsWarningAtPercent: tariff.includedSeatsWarningAtPercent,
        },
        overrides: [],
        access: activeAccess,
      }),
      getTariffForOrg: async () => storedTariff,
      listOverrides: async () => [],
      getEffectiveCommercialAccess: async () => activeAccess,
      getEnforcedQuotaUsage: async () => ({ files: 0, clinic_team: 0 }),
    };

    expect(tariff.mechanics).not.toHaveProperty('patient_card');
    expect(tariff.mechanics).not.toHaveProperty('clinic_team');
    expect(entitlementsFromSnapshot(await assignedPort.getSnapshot('org'))).toMatchObject({
      clinic_team: true,
      files: true,
    });
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: assignedPort,
    } as ReturnType<typeof buildAppDeps>);
    await expect(
      requireEntitlementForMutation({ organizationId: 'org' }, 'files'),
    ).resolves.toEqual({
      ok: true,
    });
    await expect(resolveClinicSeatLimit(assignedPort, 'org')).resolves.toBe(3);
    await expect(resolveOrgQuotaProjections(assignedPort, 'org')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mechanic: 'files', quota: { limit: 1024, unit: 'bytes' } }),
        expect.objectContaining({ mechanic: 'clinic_team', quota: { limit: 3, unit: 'seats' } }),
      ]),
    );
  });

  it('refuses file growth for an assigned tariff that never configured a file limit', async () => {
    const snapshot = {
      tariff: { mechanics: {}, quotas: {}, includedSeats: null, ...unconfiguredPolicies },
      overrides: [],
      access: activeAccess,
    };
    const port: OrgEntitlementsPort = {
      getSnapshot: async () => snapshot,
      getTariffForOrg: async () => snapshot.tariff,
      listOverrides: async () => [],
      getEffectiveCommercialAccess: async () => activeAccess,
      getEnforcedQuotaUsage: async () => ({ files: 0 }),
    };

    expect(entitlementsFromSnapshot(snapshot).files).toBe(false);
    expect(fileStorageLimitFromSnapshot(snapshot)).toBeUndefined();
    vi.mocked(buildAppDeps).mockReturnValue({ orgEntitlements: port } as ReturnType<
      typeof buildAppDeps
    >);
    const result = await requireEntitlementForMutation({ organizationId: 'org' }, 'files');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({
        error: 'entitlement_required',
        mechanic: 'files',
      });
    }
  });

  it('refuses patient and branch growth for an assigned tariff without their configured limits', () => {
    const snapshot = {
      tariff: { mechanics: {}, quotas: {}, includedSeats: null, ...unconfiguredPolicies },
      overrides: [],
      access: activeAccess,
    };

    const entitlements = entitlementsFromSnapshot(snapshot);

    expect(entitlements.patient_count).toBe(false);
    expect(entitlements.branches).toBe(false);
  });

  it('accepts owner numbers for stock mechanics without opening numbers for possibility mechanics', async () => {
    let storedTariff: Tariff | null = null;
    const platformPort: PlatformEntitlementsPort = {
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      createTariff: async (input) => {
        storedTariff = {
          ...input,
          id: 'stock-tariff',
          createdAt: '2026-07-30T00:00:00.000Z',
          updatedAt: '2026-07-30T00:00:00.000Z',
        };
        return storedTariff;
      },
      updateTariff: async () => {
        throw new Error('not_used');
      },
      archiveTariff: async () => {},
      assignTariff: async () => {},
      upsertOverride: async () => {},
      deleteOverride: async () => {},
      setTrialPolicy: async () => {},
      startTrial: async () => null,
      extendTrial: async () => ({ endsAt: '2026-08-01T00:00:00.000Z' }),
    };
    const constructor = createPlatformEntitlementsService(platformPort);

    const tariff = await constructor.createTariff(
      {
        name: 'Запасы',
        description: '',
        priceMinor: null,
        currency: null,
        billingPeriod: 'month',
        mechanics: {},
        quotas: {
          patient_count: {
            kind: 'numeric',
            limit: 25,
            unit: 'items',
            warningAtPercent: null,
          },
          branches: {
            kind: 'numeric',
            limit: 2,
            unit: 'items',
            warningAtPercent: 50,
          },
        },
        systemAccessPolicy: null,
        mechanicAccessPolicies: {},
        includedSeats: null,
        includedSeatsWarningAtPercent: null,
        isActive: true,
      },
      { actorId: 'admin', reason: '' },
    );

    expect(tariff.quotas.patient_count?.limit).toBe(25);
    expect(tariff.quotas.branches?.limit).toBe(2);
    const forbidden: TariffQuotaMap = {
      // @ts-expect-error Possibility mechanics cannot receive a number in TariffQuotaMap.
      courses: { kind: 'numeric', limit: 1, unit: 'items', warningAtPercent: null },
    };
    void forbidden;
  });

  it('uses mechanic policy before system policy and falls back to system when unset', () => {
    const snapshot: OrgEntitlementSnapshot = {
      tariff: {
        mechanics: { courses: true, booking: true },
        quotas: {},
        systemAccessPolicy: {
          graceDays: 3,
          readOnlyDays: 2,
          warningCount: 2,
          terminalState: 'disabled',
        },
        mechanicAccessPolicies: {
          courses: {
            graceDays: 0,
            readOnlyDays: 5,
            warningCount: 1,
            terminalState: 'full_access',
          },
        },
        includedSeats: null,
        includedSeatsWarningAtPercent: null,
      },
      overrides: [],
      access: {
        lifecycle: 'grace',
        tariffId: 'tariff',
        source: 'trial',
        degradationStartedAt: '2026-07-01T00:00:00.000Z',
      },
    };
    const now = new Date('2026-07-02T00:00:00.000Z');

    expect(resolveMechanicAccessFromSnapshot(snapshot, 'courses', now)).toMatchObject({
      state: 'read_only',
      policySource: 'mechanic',
      warning: null,
    });
    expect(resolveMechanicAccessFromSnapshot(snapshot, 'booking', now)).toEqual({
      mechanic: 'booking',
      state: 'grace',
      policySource: 'system',
      warning: { until: '2026-07-04T00:00:00.000Z', count: 2 },
    });
    const afterBothWindows = new Date('2026-07-10T00:00:00.000Z');
    expect(resolveMechanicAccessFromSnapshot(snapshot, 'courses', afterBothWindows).state).toBe(
      'full_access',
    );
    expect(resolveMechanicAccessFromSnapshot(snapshot, 'booking', afterBothWindows).state).toBe(
      'disabled',
    );
  });

  it('keeps a critical mechanic full-access even when tariff, exception and terminal are false', () => {
    const snapshot: OrgEntitlementSnapshot = {
      tariff: {
        mechanics: { patient_card: false },
        quotas: {},
        systemAccessPolicy: {
          graceDays: 0,
          readOnlyDays: 0,
          warningCount: 0,
          terminalState: 'disabled',
        },
        mechanicAccessPolicies: {},
        includedSeats: null,
        includedSeatsWarningAtPercent: null,
      },
      overrides: [
        {
          mechanic: 'patient_card',
          enabled: false,
          quota: null,
          expiresAt: null,
          seatLimitOverride: null,
        },
      ],
      access: { lifecycle: 'blocked', tariffId: 'tariff', source: 'assignment' },
    };

    expect(resolveMechanicAccessFromSnapshot(snapshot, 'patient_card')).toEqual({
      mechanic: 'patient_card',
      state: 'full_access',
      policySource: 'critical',
      warning: null,
    });
  });

  it('allows reads in read-only, refuses them when disabled, and shares visibility across surfaces', async () => {
    const snapshotForState = (enabled: boolean, lifecycle: 'read_only' | 'blocked') =>
      ({
        tariff: {
          mechanics: { courses: enabled },
          quotas: {},
          systemAccessPolicy: {
            graceDays: 0,
            readOnlyDays: 1,
            warningCount: 0,
            terminalState: 'disabled',
          },
          mechanicAccessPolicies: {},
          includedSeats: null,
          includedSeatsWarningAtPercent: null,
        },
        overrides: [],
        access: { lifecycle, tariffId: 'tariff', source: 'assignment' },
      }) satisfies OrgEntitlementSnapshot;
    const port = snapshotPort();
    vi.mocked(buildAppDeps).mockReturnValue({ orgEntitlements: port } as ReturnType<
      typeof buildAppDeps
    >);
    port.getSnapshot = async () => snapshotForState(true, 'read_only');

    await expect(requireEntitlementForRead({ organizationId: 'org' }, 'courses')).resolves.toEqual({
      ok: true,
    });
    await expect(
      requireEntitlementForPage({ organizationId: 'org' }, 'courses'),
    ).resolves.toBeUndefined();
    const mutation = await requireEntitlementForMutation({ organizationId: 'org' }, 'courses');
    expect(mutation.ok).toBe(false);
    if (!mutation.ok) {
      await expect(mutation.response.json()).resolves.toMatchObject({
        error: 'commercial_read_only',
      });
    }

    port.getSnapshot = async () => snapshotForState(false, 'blocked');
    const deniedRead = await requireEntitlementForRead({ organizationId: 'org' }, 'courses');
    expect(deniedRead.ok).toBe(false);
    if (!deniedRead.ok) {
      expect(deniedRead.response.status).toBe(403);
      await expect(deniedRead.response.json()).resolves.toMatchObject({
        error: 'entitlement_required',
      });
    }
    await expect(
      requireEntitlementForPage({ organizationId: 'org' }, 'courses'),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(
      resolveMechanicSurfaceVisibility({
        mechanic: 'courses',
        state: 'disabled',
        policySource: 'system',
        warning: null,
      }),
    ).toEqual({
      specialistNavigation: false,
      patientNavigation: false,
      directUrl: false,
    });
    expect(
      resolveMechanicSurfaceVisibility({
        mechanic: 'courses',
        state: 'read_only',
        policySource: 'system',
        warning: null,
      }),
    ).toEqual({
      specialistNavigation: true,
      patientNavigation: true,
      directUrl: true,
    });
  });

  it('returns explicit unconfigured instead of inventing a system duration or terminal', () => {
    const snapshot: OrgEntitlementSnapshot = {
      tariff: {
        mechanics: { courses: true },
        quotas: {},
        ...unconfiguredPolicies,
        includedSeats: null,
      },
      overrides: [],
      access: { lifecycle: 'blocked', tariffId: 'tariff', source: 'assignment' },
    };

    expect(resolveMechanicAccessFromSnapshot(snapshot, 'courses')).toEqual({
      mechanic: 'courses',
      state: 'unconfigured',
      policySource: 'unconfigured',
      warning: null,
    });
    expect(
      resolveMechanicAccessFromSnapshot(
        {
          tariff: null,
          overrides: [],
          access: { lifecycle: 'active', tariffId: null, source: 'no_trial' },
        },
        'courses',
      ),
    ).toEqual({
      mechanic: 'courses',
      state: 'unconfigured',
      policySource: 'unconfigured',
      warning: null,
    });
  });

  it('uses the owner warning percentage and emits no early warning when it is unset', async () => {
    const port = snapshotPort();
    const snapshot = await port.getSnapshot('org');
    snapshot.tariff!.includedSeats = null;
    snapshot.tariff!.quotas.files = {
      kind: 'numeric',
      limit: 10,
      unit: 'bytes',
      warningAtPercent: 40,
    };
    port.getSnapshot = async () => snapshot;
    port.getEnforcedQuotaUsage = async () => ({ files: 5 });

    await expect(resolveOrgQuotaProjections(port, 'org')).resolves.toEqual([
      expect.objectContaining({ mechanic: 'files', threshold: 'warning' }),
    ]);

    snapshot.tariff!.quotas.files.warningAtPercent = null;
    await expect(resolveOrgQuotaProjections(port, 'org')).resolves.toEqual([
      expect.objectContaining({ mechanic: 'files', threshold: 'below_warning' }),
    ]);
  });

  it('returns no clinic seat number when neither owner level configured one', async () => {
    const port = snapshotPort();
    port.getTariffForOrg = async () => ({
      mechanics: {},
      quotas: {},
      systemAccessPolicy: null,
      mechanicAccessPolicies: {},
      includedSeats: null,
      includedSeatsWarningAtPercent: null,
    });

    await expect(resolveClinicSeatLimit(port, 'org')).resolves.toBeNull();
  });

  it('uses stored organization exceptions instead of a mechanic default list', () => {
    const base = {
      tariff: null,
      access: { lifecycle: 'active' as const, tariffId: null, source: 'compatibility' as const },
    };

    expect(entitlementsFromSnapshot({ ...base, overrides: [] })).toMatchObject({
      patient_home_today: true,
      warmups: true,
      promo: true,
    });
    expect(
      entitlementsFromSnapshot({
        ...base,
        overrides: ['patient_home_today', 'warmups', 'promo'].map((mechanic) => ({
          mechanic,
          enabled: false,
          quota: null,
          expiresAt: null,
          seatLimitOverride: null,
        })),
      }),
    ).toMatchObject({
      patient_home_today: false,
      warmups: false,
      promo: false,
    });
  });

  it('keeps file growth unchanged on the no-tariff compatibility path', async () => {
    const snapshot = {
      tariff: null,
      overrides: [],
      access: { lifecycle: 'active' as const, tariffId: null, source: 'compatibility' as const },
    };

    expect(entitlementsFromSnapshot(snapshot).files).toBe(true);
    expect(fileStorageLimitFromSnapshot(snapshot)).toBeNull();
  });

  it('permits a stock mechanic declaration but rejects a period at compile time', () => {
    const stock = {
      class: 'запас',
      label: 'Черновой запас',
      quotaEnforcement: 'application_transaction_snapshot',
    } satisfies MechanicDefinition;
    // @ts-expect-error Stock mechanics never have a period.
    const stockWithPeriod = { ...stock, period: 'month' } satisfies MechanicDefinition;

    expect(stock.class).toBe('запас');
    void stockWithPeriod;
  });
});
