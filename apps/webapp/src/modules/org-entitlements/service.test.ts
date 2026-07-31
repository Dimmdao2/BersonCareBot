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
  evaluateTariffDowngrade,
  fileStorageLimitFromSnapshot,
  resolveClinicSeatLimit,
  resolveOrgQuotaProjections,
  resolveOwnOrgQuotaProjections,
  TariffDowngradeBlockedError,
} from '@/modules/org-entitlements/service';
import type {
  OrgEntitlementsPort,
  PlatformEntitlementsPort,
  PlatformOrganizationSummary,
} from '@/modules/org-entitlements/ports';
import {
  MECHANIC_REGISTRY,
  MECHANICS,
  type MechanicDefinition,
  type OrgMechanic,
  type Tariff,
  type TariffQuota,
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

/** Cabinet entry is its own ladder subject (§5a/2.1a); these cases are about mechanics only. */
const openCabinet: Pick<OrgEntitlementsPort, 'resolveCabinetAccess'> = {
  resolveCabinetAccess: async () => ({
    state: 'full_access',
    policySource: 'system',
    warning: null,
  }),
};

function snapshotPort(): OrgEntitlementsPort {
  return {
    ...openCabinet,
    async resolveMechanicAccess(_organizationId, mechanic) {
      return { mechanic, state: 'full_access', policySource: 'system', warning: null };
    },
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
    async getOwnQuotaUsage() {
      return { files: 5 };
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

    expect(result).toEqual({ ok: true, warning: null });
  });

  it('keeps patient_diaries included under the worst commercial state (#1069, owner 31.07: "дневники у пациентов не отбираем")', () => {
    const worstCaseSnapshot = {
      tariff: {
        mechanics: Object.fromEntries(MECHANICS.map((mechanic) => [mechanic, false])),
        quotas: {},
        includedSeats: null,
        ...unconfiguredPolicies,
      },
      overrides: [
        {
          mechanic: 'patient_diaries',
          enabled: false,
          quota: null,
          expiresAt: null,
          seatLimitOverride: null,
        },
      ],
      access: { lifecycle: 'blocked' as const, tariffId: null, source: 'no_trial' as const },
    };

    expect(entitlementsFromSnapshot(worstCaseSnapshot).patient_diaries).toBe(true);
  });

  it('keeps numeric mechanics enabled and resolves their configured limits from a new tariff', async () => {
    let storedTariff: Tariff | null = null;
    const platformPort: PlatformEntitlementsPort = {
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      getOrganizationMechanicUsage: async () => ({}),
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
        downgradePolicies: {},
        includedSeats: 3,
        includedSeatsWarningAtPercent: null,
        isActive: true,
      },
      { actorId: 'admin', reason: '' },
    );
    const assignedPort: OrgEntitlementsPort = {
      ...openCabinet,
      resolveMechanicAccess: async (_organizationId, mechanic) => ({
        mechanic,
        state: 'full_access',
        policySource: 'system',
        warning: null,
      }),
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
      getOwnQuotaUsage: async () => ({ files: 0, clinic_team: 0 }),
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
      warning: null,
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
      ...openCabinet,
      resolveMechanicAccess: async (_organizationId, mechanic) => ({
        mechanic,
        state: 'disabled',
        policySource: 'unconfigured',
        warning: null,
      }),
      getSnapshot: async () => snapshot,
      getTariffForOrg: async () => snapshot.tariff,
      listOverrides: async () => [],
      getEffectiveCommercialAccess: async () => activeAccess,
      getEnforcedQuotaUsage: async () => ({ files: 0 }),
      getOwnQuotaUsage: async () => ({ files: 0 }),
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
      getOrganizationMechanicUsage: async () => ({}),
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
        downgradePolicies: {},
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

  it('§5a stage 6.1/6.2 — projects "used out of included" for patients and branches, from either usage source', async () => {
    const snapshot = {
      tariff: {
        mechanics: {},
        quotas: {
          patient_count: { kind: 'numeric', limit: 25, unit: 'items', warningAtPercent: null },
          branches: { kind: 'numeric', limit: 2, unit: 'items', warningAtPercent: 50 },
        } as TariffQuotaMap,
        includedSeats: null,
        ...unconfiguredPolicies,
      },
      overrides: [],
      access: activeAccess,
    };
    const platformPort: OrgEntitlementsPort = {
      ...openCabinet,
      resolveMechanicAccess: async (_organizationId, mechanic) => ({
        mechanic,
        state: 'full_access',
        policySource: 'system',
        warning: null,
      }),
      getSnapshot: async () => snapshot,
      getTariffForOrg: async () => snapshot.tariff,
      listOverrides: async () => [],
      getEffectiveCommercialAccess: async () => activeAccess,
      getEnforcedQuotaUsage: async () => ({ patient_count: 25, branches: 1 }),
      getOwnQuotaUsage: async () => ({ patient_count: 25, branches: 2 }),
    };

    await expect(resolveOrgQuotaProjections(platformPort, 'org')).resolves.toEqual([
      expect.objectContaining({ mechanic: 'patient_count', usage: 25, threshold: 'reached' }),
      expect.objectContaining({ mechanic: 'branches', usage: 1, threshold: 'warning' }),
    ]);
    await expect(resolveOwnOrgQuotaProjections(platformPort, 'org')).resolves.toEqual([
      expect.objectContaining({ mechanic: 'patient_count', usage: 25, threshold: 'reached' }),
      expect.objectContaining({ mechanic: 'branches', usage: 2, threshold: 'reached' }),
    ]);
  });

  it('allows reads in read-only, refuses them when disabled, and shares visibility across surfaces', async () => {
    const port = snapshotPort();
    vi.mocked(buildAppDeps).mockReturnValue({ orgEntitlements: port } as ReturnType<
      typeof buildAppDeps
    >);
    port.resolveMechanicAccess = async (_organizationId, mechanic) => ({
      mechanic,
      state: 'read_only',
      policySource: 'system',
      warning: null,
    });

    await expect(requireEntitlementForRead({ organizationId: 'org' }, 'courses')).resolves.toEqual({
      ok: true,
      warning: null,
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

    port.resolveMechanicAccess = async (_organizationId, mechanic) => ({
      mechanic,
      state: 'disabled',
      policySource: 'system',
      warning: null,
    });
    const deniedRead = await requireEntitlementForRead({ organizationId: 'org' }, 'courses');
    expect(deniedRead.ok).toBe(false);
    if (!deniedRead.ok) {
      expect(deniedRead.response.status).toBe(403);
      await expect(deniedRead.response.json()).resolves.toMatchObject({
        error: 'entitlement_required',
      });
    }
    await expect(requireEntitlementForPage({ organizationId: 'org' }, 'courses')).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
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
      warning: null,
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
      warning: null,
    });
  });

  it('carries the grace date, count and next state through the guard and visibility adapter', async () => {
    const port = snapshotPort();
    port.resolveMechanicAccess = async (_organizationId, mechanic) => ({
      mechanic,
      state: 'grace',
      policySource: 'system',
      warning: {
        until: '2026-08-02T00:00:00.000Z',
        count: 4,
        nextState: 'read_only',
      },
    });
    vi.mocked(buildAppDeps).mockReturnValue({ orgEntitlements: port } as ReturnType<
      typeof buildAppDeps
    >);

    const read = await requireEntitlementForRead({ organizationId: 'org' }, 'courses');
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.warning).toMatchObject({ count: 4, nextState: 'read_only' });
      expect(read.warning?.until).toBe('2026-08-02T00:00:00.000Z');
    }
    expect(
      resolveMechanicSurfaceVisibility({
        mechanic: 'courses',
        state: 'grace',
        policySource: 'system',
        warning: {
          until: '2026-08-02T00:00:00.000Z',
          count: 4,
          nextState: 'read_only',
        },
      }),
    ).toEqual({
      specialistNavigation: true,
      patientNavigation: true,
      directUrl: true,
      warning: {
        until: '2026-08-02T00:00:00.000Z',
        count: 4,
        nextState: 'read_only',
      },
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

describe('tariff downgrade guard (§5a stage 4b.3/4b.4 — "ручка 2")', () => {
  function baseTariff(overrides: Partial<Tariff>): Tariff {
    return {
      id: 'tariff',
      name: 'T',
      description: '',
      priceMinor: null,
      currency: null,
      billingPeriod: 'month',
      mechanics: {},
      quotas: {},
      systemAccessPolicy: null,
      mechanicAccessPolicies: {},
      downgradePolicies: {},
      includedSeats: null,
      includedSeatsWarningAtPercent: null,
      isActive: true,
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
      ...overrides,
    };
  }

  // Main proof for 4b.4: ONE function (`evaluateTariffDowngrade`), same numeric-mechanic shape,
  // two different mechanics (`patient_count`, `branches`) and two different knob values each —
  // behaviour differs by the VALUE stored on the tariff, never by which mechanic it is.
  it.each([
    ['patient_count', 'block', 12, true],
    ['patient_count', 'freeze_growth', 12, false],
    ['branches', 'block', 5, true],
    ['branches', 'freeze_growth', 5, false],
  ] as const)(
    'numeric mechanic %s with downgrade policy %s and usage %d over the new limit -> blocked=%s',
    (mechanic, policy, usage, expectBlocked) => {
      const targetTariff = baseTariff({
        quotas: { [mechanic]: { kind: 'numeric', limit: 3, unit: 'items', warningAtPercent: null } },
        downgradePolicies: { [mechanic]: policy },
      });
      const blocks = evaluateTariffDowngrade({
        usage: { [mechanic]: usage },
        currentTariff: baseTariff({}),
        targetTariff,
      });
      expect(blocks.length > 0).toBe(expectBlocked);
      if (expectBlocked) expect(blocks).toEqual([{ mechanic, reason: 'quota_exceeded' }]);
    },
  );

  it('a capability mechanic newly excluded is blocked or allowed by the SAME function per its own policy value', () => {
    const currentTariff = baseTariff({ mechanics: { branding: true } });
    const blockedTarget = baseTariff({
      mechanics: { branding: false },
      downgradePolicies: { branding: 'block' },
    });
    const allowedTarget = baseTariff({
      mechanics: { branding: false },
      downgradePolicies: { branding: 'disable_immediately' },
    });

    expect(evaluateTariffDowngrade({ usage: {}, currentTariff, targetTariff: blockedTarget })).toEqual([
      { mechanic: 'branding', reason: 'mechanic_removed' },
    ]);
    expect(
      evaluateTariffDowngrade({ usage: {}, currentTariff, targetTariff: allowedTarget }),
    ).toEqual([]);
  });

  it('defaults an unset downgrade policy to `block` (fail-closed), never to unlimited growth', () => {
    const targetTariff = baseTariff({
      quotas: { branches: { kind: 'numeric', limit: 2, unit: 'items', warningAtPercent: null } },
      // downgradePolicies deliberately left empty — owner never configured this mechanic's knob.
    });
    const blocks = evaluateTariffDowngrade({
      usage: { branches: 5 },
      currentTariff: baseTariff({}),
      targetTariff,
    });
    expect(blocks).toEqual([{ mechanic: 'branches', reason: 'quota_exceeded' }]);
  });

  it('never blocks re-assigning a tariff the org already fits (upgrade, or same tariff again)', () => {
    const currentTariff = baseTariff({
      mechanics: { branding: true },
      quotas: { patient_count: { kind: 'numeric', limit: 10, unit: 'items', warningAtPercent: null } },
    });
    const targetTariff = baseTariff({
      mechanics: { branding: true },
      quotas: { patient_count: { kind: 'numeric', limit: 100, unit: 'items', warningAtPercent: null } },
      downgradePolicies: { patient_count: 'block', branding: 'block' },
    });
    expect(
      evaluateTariffDowngrade({ usage: { patient_count: 40 }, currentTariff, targetTariff }),
    ).toEqual([]);
  });

  function platformPortWithUsage(input: {
    organizationId: string;
    currentTariff: Tariff;
    targetTariff: Tariff;
    usage: Partial<Record<string, number>>;
  }): { port: PlatformEntitlementsPort; assignCalls: Array<[string, string | null]> } {
    const assignCalls: Array<[string, string | null]> = [];
    const organization: PlatformOrganizationSummary = {
      id: input.organizationId,
      title: 'org',
      tariffId: input.currentTariff.id,
      manualTariffId: input.currentTariff.id,
      isActive: true,
      commercialAccessState: 'active',
      effectiveAccess: { lifecycle: 'active', tariffId: input.currentTariff.id, source: 'assignment' },
      overrides: [],
      trial: null,
    };
    const port: PlatformEntitlementsPort = {
      listTariffs: async () => [input.currentTariff, input.targetTariff],
      listOrganizations: async () => [organization],
      getTrialPolicy: async () => null,
      getOrganizationMechanicUsage: async () => input.usage,
      createTariff: async () => {
        throw new Error('not_used');
      },
      updateTariff: async () => {
        throw new Error('not_used');
      },
      archiveTariff: async () => {},
      assignTariff: async (organizationId, tariffId) => {
        assignCalls.push([organizationId, tariffId]);
      },
      upsertOverride: async () => {},
      deleteOverride: async () => {},
      setTrialPolicy: async () => {},
      startTrial: async () => null,
      extendTrial: async () => ({ endsAt: '2026-08-01T00:00:00.000Z' }),
    };
    return { port, assignCalls };
  }

  it('refuses the tariff switch itself when a numeric mechanic is over the new limit and policy is `block`', async () => {
    const currentTariff = baseTariff({ id: 'big' });
    const targetTariff = baseTariff({
      id: 'small',
      quotas: { patient_count: { kind: 'numeric', limit: 3, unit: 'items', warningAtPercent: null } },
      downgradePolicies: { patient_count: 'block' },
    });
    const { port, assignCalls } = platformPortWithUsage({
      organizationId: 'org',
      currentTariff,
      targetTariff,
      usage: { patient_count: 10 },
    });
    const service = createPlatformEntitlementsService(port);

    await expect(service.assignTariff('org', 'small', { actorId: null, reason: '' })).rejects.toThrow(
      TariffDowngradeBlockedError,
    );
    // Invariant (4b.5): a refused switch never touches data — the mutation port is never called.
    expect(assignCalls).toEqual([]);
  });

  it('lets the tariff switch through when the policy is `freeze_growth`, even over the new limit', async () => {
    const currentTariff = baseTariff({ id: 'big' });
    const targetTariff = baseTariff({
      id: 'small',
      quotas: { patient_count: { kind: 'numeric', limit: 3, unit: 'items', warningAtPercent: null } },
      downgradePolicies: { patient_count: 'freeze_growth' },
    });
    const { port, assignCalls } = platformPortWithUsage({
      organizationId: 'org',
      currentTariff,
      targetTariff,
      usage: { patient_count: 10 },
    });
    const service = createPlatformEntitlementsService(port);

    await expect(
      service.assignTariff('org', 'small', { actorId: null, reason: '' }),
    ).resolves.toBeUndefined();
    expect(assignCalls).toEqual([['org', 'small']]);
  });

  it('names every blocking mechanic on the error — a refused switch is never a silent no-op', async () => {
    const currentTariff = baseTariff({ id: 'big', mechanics: { branding: true } });
    const targetTariff = baseTariff({
      id: 'small',
      mechanics: { branding: false },
      quotas: { branches: { kind: 'numeric', limit: 1, unit: 'items', warningAtPercent: null } },
      downgradePolicies: { branches: 'block', branding: 'block' },
    });
    const { port } = platformPortWithUsage({
      organizationId: 'org',
      currentTariff,
      targetTariff,
      usage: { branches: 4 },
    });
    const service = createPlatformEntitlementsService(port);

    try {
      await service.assignTariff('org', 'small', { actorId: null, reason: '' });
      expect.unreachable('expected a TariffDowngradeBlockedError');
    } catch (error) {
      expect(error).toBeInstanceOf(TariffDowngradeBlockedError);
      const blocked = (error as TariffDowngradeBlockedError).blocks;
      expect(blocked).toEqual(
        expect.arrayContaining([
          { mechanic: 'branches', reason: 'quota_exceeded' },
          { mechanic: 'branding', reason: 'mechanic_removed' },
        ]),
      );
    }
  });
});

describe('access ladder terminal state (§5a stage 4b.2 — exactly two values)', () => {
  it('rejects `full_access` as a configured terminal state', async () => {
    const platformPort: PlatformEntitlementsPort = {
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      getOrganizationMechanicUsage: async () => ({}),
      createTariff: async (input) => ({
        ...input,
        id: 'x',
        createdAt: '2026-07-30T00:00:00.000Z',
        updatedAt: '2026-07-30T00:00:00.000Z',
      }),
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
    const service = createPlatformEntitlementsService(platformPort);

    expect(() =>
      service.createTariff(
        {
          name: 'Broken',
          description: '',
          priceMinor: null,
          currency: null,
          billingPeriod: 'month',
          mechanics: Object.fromEntries(MECHANICS.map((mechanic) => [mechanic, false])),
          quotas: {},
          // @ts-expect-error `full_access` was removed from AccessTerminalState — this must be a type error too.
          systemAccessPolicy: { graceDays: 1, readOnlyDays: 1, warningCount: 0, terminalState: 'full_access' },
          mechanicAccessPolicies: {},
          downgradePolicies: {},
          includedSeats: null,
          includedSeatsWarningAtPercent: null,
          isActive: true,
        },
        { actorId: null, reason: '' },
      ),
    ).toThrow('access_policy_terminal_state_invalid');
  });
});

describe('§5a stage 6.4 — critical mechanics carry neither a ladder nor a number (blocker)', () => {
  function criticalMechanics() {
    return MECHANICS.filter((mechanic) => MECHANIC_REGISTRY[mechanic].class === 'никогда');
  }

  function baseTariffInput(
    overrides: Partial<Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>> = {},
  ): Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: 'Тест',
      description: '',
      priceMinor: null,
      currency: null,
      billingPeriod: 'month',
      mechanics: Object.fromEntries(MECHANICS.map((mechanic) => [mechanic, false])),
      quotas: {},
      systemAccessPolicy: null,
      mechanicAccessPolicies: {},
      downgradePolicies: {},
      includedSeats: null,
      includedSeatsWarningAtPercent: null,
      isActive: true,
      ...overrides,
    };
  }

  function servicePort(): PlatformEntitlementsPort {
    return {
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      getOrganizationMechanicUsage: async () => ({}),
      createTariff: async (input) => ({
        ...input,
        id: 'x',
        createdAt: '2026-07-31T00:00:00.000Z',
        updatedAt: '2026-07-31T00:00:00.000Z',
      }),
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
  }

  it('there really are critical mechanics to check (a canon list, not an accidentally empty one)', () => {
    expect(criticalMechanics()).toEqual(
      expect.arrayContaining(['patient_card', 'patient_app', 'patient_diaries']),
    );
  });

  it('refuses an access-lifecycle policy on any critical mechanic (no ladder)', () => {
    const service = createPlatformEntitlementsService(servicePort());
    for (const mechanic of criticalMechanics()) {
      expect(() =>
        service.createTariff(
          baseTariffInput({
            mechanicAccessPolicies: {
              [mechanic]: {
                graceDays: 1,
                readOnlyDays: 1,
                warningCount: 0,
                terminalState: 'read_only',
              },
            },
          }),
          { actorId: null, reason: '' },
        ),
      ).toThrow('critical_mechanic_access_policy_forbidden');
    }
  });

  it('refuses a numeric quota on any critical mechanic (no number)', () => {
    const service = createPlatformEntitlementsService(servicePort());
    for (const mechanic of criticalMechanics()) {
      const quotas = {
        [mechanic]: { kind: 'numeric', limit: 1, unit: 'items', warningAtPercent: null },
      } as never;
      expect(() =>
        service.createTariff(baseTariffInput({ quotas }), { actorId: null, reason: '' }),
      ).toThrow('tariff_quota_unit_invalid');
    }
  });

  it('keeps every critical mechanic included no matter how the tariff/override tries to disable it', () => {
    for (const mechanic of criticalMechanics()) {
      const worstCaseSnapshot = {
        tariff: {
          mechanics: Object.fromEntries(MECHANICS.map((entry) => [entry, false])),
          quotas: {},
          includedSeats: null,
          ...unconfiguredPolicies,
        },
        overrides: [
          { mechanic, enabled: false, quota: null, expiresAt: null, seatLimitOverride: null },
        ],
        access: { lifecycle: 'blocked' as const, tariffId: null, source: 'no_trial' as const },
      };

      expect(entitlementsFromSnapshot(worstCaseSnapshot)[mechanic]).toBe(true);
    }
  });

  // §5a/2.1b, вторая половина: «Критичные механики … не являются тарифными опциями и в тариф не
  // попадают вовсе». Не «попадают выключенными», а отсутствуют как ключ — иначе владелец увидит у
  // них рубильник в конструкторе.
  // Арбитр: снять фильтр `class === 'возможность'` в `normalizeTariffInput` (пустить в `mechanics`
  // все ключи) — тест краснеет.
  it('drops every critical mechanic from the tariff itself — not even as a switched-off key', async () => {
    const service = createPlatformEntitlementsService(servicePort());
    const enableEverything = Object.fromEntries(MECHANICS.map((mechanic) => [mechanic, true]));

    const tariff = await service.createTariff(baseTariffInput({ mechanics: enableEverything }), {
      actorId: null,
      reason: '',
    });

    const leaked = criticalMechanics().filter((mechanic) => mechanic in tariff.mechanics);
    expect(leaked, `критичные механики попали в тариф: ${leaked.join(', ')}`).toEqual([]);
    // И проверка не пустая: обычные механики в тарифе есть.
    expect(Object.keys(tariff.mechanics).length).toBeGreaterThan(0);
  });
});

// §5a/2.1b, первая половина: «Исключений НЕТ ни у одной механики, включённой в тариф: агент не
// выбирает, какая подчиняется лестнице. Механическая проверка: в коде нет ни одного списка механик,
// исключённых из лестницы по решению агента».
//
// Список нельзя ловить по тексту исходника (правило `tests-check-behaviour-not-circumstances`),
// поэтому он ловится ПОВЕДЕНИЕМ: единая дверь прогоняется по ВСЕМУ реестру, и ни одна тарифная
// механика не имеет права проскочить. Любой список-исключение, добавленный агентом, обязательно
// откроет хотя бы одну из них — и тест назовёт её поимённо.
describe('§5a/2.1b: у лестницы нет ни одной механики-исключения', () => {
  function configurableMechanics(): OrgMechanic[] {
    return MECHANICS.filter((mechanic) => MECHANIC_REGISTRY[mechanic].class !== 'никогда');
  }

  function portResolvingEveryMechanic(state: 'disabled' | 'read_only'): OrgEntitlementsPort {
    return {
      ...openCabinet,
      resolveMechanicAccess: async (_organizationId: string, mechanic: OrgMechanic) => ({
        mechanic,
        state,
        policySource: 'system' as const,
        warning: null,
      }),
    } as unknown as OrgEntitlementsPort;
  }

  // Арбитр: добавить в `checkEntitlement` строку вида
  // `if (['promo','warmups'].includes(mechanic)) return { ok: true }` — тест краснеет и печатает
  // именно эти механики.
  it('ни одна тарифная механика не проходит дверь на ступени «выключено»', async () => {
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: portResolvingEveryMechanic('disabled'),
    } as ReturnType<typeof buildAppDeps>);

    const escaped: OrgMechanic[] = [];
    for (const mechanic of configurableMechanics()) {
      const read = await requireEntitlementForRead({ organizationId: 'org' }, mechanic);
      const mutation = await requireEntitlementForMutation({ organizationId: 'org' }, mechanic);
      if (read.ok || mutation.ok) escaped.push(mechanic);
    }

    expect(escaped, `механики в обход лестницы: ${escaped.join(', ')}`).toEqual([]);
  });

  // Арбитр: тот же список-исключение, но на ступени «только чтение» — тест краснеет.
  it('ни одна тарифная механика не пишет на ступени «только чтение»', async () => {
    vi.mocked(buildAppDeps).mockReturnValue({
      orgEntitlements: portResolvingEveryMechanic('read_only'),
    } as ReturnType<typeof buildAppDeps>);

    const escaped: OrgMechanic[] = [];
    for (const mechanic of configurableMechanics()) {
      const mutation = await requireEntitlementForMutation({ organizationId: 'org' }, mechanic);
      if (mutation.ok) escaped.push(mechanic);
      // Чтение на этой ступени обязано остаться открытым — канон §4a.
      const read = await requireEntitlementForRead({ organizationId: 'org' }, mechanic);
      expect(read.ok, `чтение закрыто у ${mechanic}`).toBe(true);
    }

    expect(escaped, `запись в обход лестницы: ${escaped.join(', ')}`).toEqual([]);
  });
});

describe('§5a stage 6.3 — enabling one mechanic follows the owner\'s sequence, not a new engine', () => {
  it('shows the numbers, finds who exceeds the new limit, grants an exception, then enables cleanly', async () => {
    const overrides: Array<{
      organizationId: string;
      mechanic: OrgMechanic;
      enabled: boolean;
      quota: TariffQuota | null;
      expiresAt: string | null;
    }> = [];
    const platformPort: PlatformEntitlementsPort = {
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      getOrganizationMechanicUsage: async () => ({}),
      createTariff: async () => {
        throw new Error('not_used');
      },
      updateTariff: async () => {
        throw new Error('not_used');
      },
      archiveTariff: async () => {},
      assignTariff: async () => {},
      upsertOverride: async (input) => {
        overrides.push(input);
      },
      deleteOverride: async () => {},
      setTrialPolicy: async () => {},
      startTrial: async () => null,
      extendTrial: async () => ({ endsAt: '2026-08-01T00:00:00.000Z' }),
    };
    const service = createPlatformEntitlementsService(platformPort);
    const candidateTariff = {
      mechanics: {},
      quotas: {
        patient_count: { kind: 'numeric', limit: 10, unit: 'items', warningAtPercent: null },
      } as TariffQuotaMap,
      includedSeats: null,
      ...unconfiguredPolicies,
    };
    const orgPort = (usage: number, override: (typeof overrides)[number] | null): OrgEntitlementsPort => ({
      ...openCabinet,
      resolveMechanicAccess: async (_organizationId, mechanic) => ({
        mechanic,
        state: 'full_access',
        policySource: 'system',
        warning: null,
      }),
      getSnapshot: async () => ({
        tariff: candidateTariff,
        overrides: override
          ? [
              {
                mechanic: override.mechanic,
                enabled: override.enabled,
                quota: override.quota,
                expiresAt: override.expiresAt,
                seatLimitOverride: null,
              },
            ]
          : [],
        access: activeAccess,
      }),
      getTariffForOrg: async () => candidateTariff,
      listOverrides: async () => [],
      getEffectiveCommercialAccess: async () => activeAccess,
      getEnforcedQuotaUsage: async () => ({ patient_count: usage }),
      getOwnQuotaUsage: async () => ({ patient_count: usage }),
    });

    // 1) показать числа — 2) найти превысивших: this clinic already has 12 patients, the
    // candidate tariff's limit is 10.
    const before = await resolveOrgQuotaProjections(orgPort(12, null), 'org-over-limit');
    expect(before).toEqual([
      expect.objectContaining({ mechanic: 'patient_count', usage: 12, threshold: 'reached' }),
    ]);

    // 3) выдать исключение: an unlimited override for this one organization.
    await service.upsertOverride(
      {
        organizationId: 'org-over-limit',
        mechanic: 'patient_count',
        enabled: true,
        quota: { kind: 'unlimited', limit: null, warningAtPercent: null, unit: 'items' },
        expiresAt: null,
      },
      { actorId: 'owner', reason: 'exceeds new patient_count limit' },
    );
    expect(overrides).toEqual([
      expect.objectContaining({ organizationId: 'org-over-limit', mechanic: 'patient_count' }),
    ]);

    // 4) включить: with the exception in place, the mechanic is enabled and no longer flagged as
    // over a (now irrelevant) numeric limit.
    const after = await resolveOrgQuotaProjections(orgPort(12, overrides[0]!), 'org-over-limit');
    expect(after).toEqual([]);
  });
});
