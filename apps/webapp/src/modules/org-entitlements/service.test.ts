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
  evaluateTariffTransition,
  fileStorageLimitFromSnapshot,
  resolveOwnTariffTransition,
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
  type TrialPolicy,
} from '@/modules/org-entitlements/types';

import { isCabinetEntryBlocked } from '@/app-layer/guards/cabinetAccessGate';
import { createInMemoryPlatformEntitlementsPort } from '@/infra/repos/inMemoryPlatformEntitlements';

const PLATFORM_BILLING_PORT_STUBS = {
  listBillingPeriods: async () => [],
  upsertBillingPeriod: async (input: { code: string; label: string; months: number }) => ({
    code: input.code,
    label: input.label,
    months: input.months,
    isSelectable: true,
    sortOrder: input.months * 10,
  }),
  getPaidPeriodPolicy: async () => null,
  setPaidPeriodPolicy: async (policy: {
    postPaidPeriodBehavior: 'read_only' | 'blocked' | 'tariff';
    postPaidPeriodTariffId: string | null;
    isActive: boolean;
  }) => policy,
} satisfies Pick<
  PlatformEntitlementsPort,
  'listBillingPeriods' | 'upsertBillingPeriod' | 'getPaidPeriodPolicy' | 'setPaidPeriodPolicy'
>;

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

describe('registration tariff policy archive wall', () => {
  const tariffInput: Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'> = {
    name: 'Registration tariff',
    description: '',
    priceMinor: null,
    currency: null,
    billingPeriod: 'month',
    mechanics: {},
    quotas: {},
    systemAccessPolicy: null,
    mechanicAccessPolicies: {},
    downgradePolicies: {},
    mailingTemplates: [],
    includedSeats: 1,
    additionalSeatPriceMinor: null,
    discountedPriceMinor: null,
    isActive: true,
  };

  it('refuses both admin deactivation paths while the registration tariff policy is non-empty', async () => {
    const service = createPlatformEntitlementsService(createInMemoryPlatformEntitlementsPort());
    const audit = { actorId: 'admin', reason: 'registration policy wall' };
    const tariff = await service.createTariff(tariffInput, audit);
    await service.setRegistrationTariffPolicy({ tariffId: tariff.id }, audit);

    await expect(service.archiveTariff(tariff.id, audit)).rejects.toThrow(
      'tariff_used_by_registration_tariff_policy',
    );
    await expect(service.updateTariff(tariff.id, { ...tariffInput, isActive: false }, audit)).rejects.toThrow(
      'tariff_used_by_registration_tariff_policy',
    );
  });
});

const unconfiguredPolicies = {
  systemAccessPolicy: null,
  mechanicAccessPolicies: {},
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
    async resolveCabinetAccess() {
      return { state: 'full_access', policySource: 'system', warning: null };
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
    async getActiveTariffById() {
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
      access: { lifecycle: 'blocked' as const, tariffId: null, source: 'assignment' as const },
    };

    expect(entitlementsFromSnapshot(worstCaseSnapshot).patient_diaries).toBe(true);
  });

  it('keeps numeric mechanics enabled and resolves their configured limits from a new tariff', async () => {
    let storedTariff: Tariff | null = null;
    const platformPort: PlatformEntitlementsPort = {
      ...PLATFORM_BILLING_PORT_STUBS,
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      getRegistrationTariffPolicy: async () => ({ tariffId: null }),
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
      setRegistrationTariffPolicy: async () => {},
      startTrial: async () => null,
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
        mailingTemplates: [],
        includedSeats: 3,
        additionalSeatPriceMinor: null,
        discountedPriceMinor: null,
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
      resolveCabinetAccess: async () => ({
        state: 'full_access' as const,
        policySource: 'system' as const,
        warning: null,
      }),
      getSnapshot: async () => ({
        tariff: {
          mechanics: tariff.mechanics,
          quotas: tariff.quotas,
          systemAccessPolicy: tariff.systemAccessPolicy,
          mechanicAccessPolicies: tariff.mechanicAccessPolicies,
          includedSeats: tariff.includedSeats,
        },
        overrides: [],
        access: activeAccess,
      }),
      getTariffForOrg: async () => storedTariff,
      getActiveTariffById: async () => null,
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
      resolveCabinetAccess: async () => ({
        state: 'full_access' as const,
        policySource: 'system' as const,
        warning: null,
      }),
      getSnapshot: async () => snapshot,
      getTariffForOrg: async () => snapshot.tariff,
      getActiveTariffById: async () => null,
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
      ...PLATFORM_BILLING_PORT_STUBS,
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      getRegistrationTariffPolicy: async () => ({ tariffId: null }),
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
      setRegistrationTariffPolicy: async () => {},
      startTrial: async () => null,
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
          },
        },
        systemAccessPolicy: null,
        mechanicAccessPolicies: {},
        downgradePolicies: {},
        mailingTemplates: [],
        includedSeats: 1,
        additionalSeatPriceMinor: null,
        discountedPriceMinor: null,
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

  it('§5a stage 6.1/6.2 — projects "used out of included" for patients, files and branches, from either usage source', async () => {
    const snapshot = {
      tariff: {
        mechanics: {},
        quotas: {
          files: { kind: 'numeric', limit: 1000, unit: 'bytes', warningAtPercent: null },
          patient_count: { kind: 'numeric', limit: 25, unit: 'items', warningAtPercent: null },
          branches: { kind: 'numeric', limit: 2, unit: 'items' },
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
      resolveCabinetAccess: async () => ({
        state: 'full_access' as const,
        policySource: 'system' as const,
        warning: null,
      }),
      getSnapshot: async () => snapshot,
      getTariffForOrg: async () => snapshot.tariff,
      getActiveTariffById: async () => null,
      listOverrides: async () => [],
      getEffectiveCommercialAccess: async () => activeAccess,
      getEnforcedQuotaUsage: async () => ({ files: 1000, patient_count: 25, branches: 1 }),
      getOwnQuotaUsage: async () => ({ files: 1000, patient_count: 25, branches: 2 }),
    };

    await expect(resolveOrgQuotaProjections(platformPort, 'org')).resolves.toEqual([
      expect.objectContaining({ mechanic: 'files', usage: 1000, threshold: 'reached' }),
      expect.objectContaining({ mechanic: 'patient_count', usage: 25, threshold: 'reached' }),
      // §5a item 2.6a — branches have no early warning at all: below the limit is below_warning
      // and nothing else, whatever percentage anyone tries to store for them.
      expect.objectContaining({ mechanic: 'branches', usage: 1, threshold: 'below_warning' }),
    ]);
    await expect(resolveOwnOrgQuotaProjections(platformPort, 'org')).resolves.toEqual([
      expect.objectContaining({ mechanic: 'files', usage: 1000, threshold: 'reached' }),
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

  it('carries the grace date, owner notification rows and next state through the guard and visibility adapter', async () => {
    const port = snapshotPort();
    port.resolveMechanicAccess = async (_organizationId, mechanic) => ({
      mechanic,
      state: 'grace',
      policySource: 'system',
      warning: {
        until: '2026-08-02T00:00:00.000Z',
        periodEndsAt: '2026-07-29T00:00:00.000Z',
        periodSource: 'paid_period',
        notifications: [
          { offsetDays: -3, condition: 'payment_failed', template: 'Оплатите {{тариф}}' },
        ],
        nextState: 'read_only',
      },
    });
    vi.mocked(buildAppDeps).mockReturnValue({ orgEntitlements: port } as ReturnType<
      typeof buildAppDeps
    >);

    const read = await requireEntitlementForRead({ organizationId: 'org' }, 'courses');
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.warning).toMatchObject({
        nextState: 'read_only',
        periodEndsAt: '2026-07-29T00:00:00.000Z',
        notifications: [
          { offsetDays: -3, condition: 'payment_failed', template: 'Оплатите {{тариф}}' },
        ],
      });
      expect(read.warning?.until).toBe('2026-08-02T00:00:00.000Z');
    }
    expect(
      resolveMechanicSurfaceVisibility({
        mechanic: 'courses',
        state: 'grace',
        policySource: 'system',
        warning: {
          until: '2026-08-02T00:00:00.000Z',
          periodEndsAt: '2026-07-29T00:00:00.000Z',
          periodSource: 'paid_period',
          notifications: [
            { offsetDays: -3, condition: 'payment_failed', template: 'Оплатите {{тариф}}' },
          ],
          nextState: 'read_only',
        },
      }),
    ).toEqual({
      specialistNavigation: true,
      patientNavigation: true,
      directUrl: true,
      warning: {
        until: '2026-08-02T00:00:00.000Z',
        periodEndsAt: '2026-07-29T00:00:00.000Z',
        periodSource: 'paid_period',
        notifications: [
          { offsetDays: -3, condition: 'payment_failed', template: 'Оплатите {{тариф}}' },
        ],
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
    });

    await expect(resolveClinicSeatLimit(port, 'org')).resolves.toBeNull();
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
      mailingTemplates: [],
      includedSeats: 1,
      additionalSeatPriceMinor: null,
      discountedPriceMinor: null,
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
      quotas: { branches: { kind: 'numeric', limit: 2, unit: 'items' } },
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

  it('classifies unlimited to finite as next-period even when usage does not block it', () => {
    const transition = evaluateTariffTransition({
      usage: { patient_count: 1 },
      currentTariff: baseTariff({ quotas: { patient_count: { kind: 'unlimited', limit: null, unit: 'items', warningAtPercent: null } } }),
      targetTariff: baseTariff({
        quotas: { patient_count: { kind: 'numeric', limit: 10, unit: 'items', warningAtPercent: null } },
        downgradePolicies: { patient_count: 'freeze_growth' },
      }),
    });
    expect(transition).toMatchObject({ blocks: [], appliesNextPeriod: true });
  });

  it('self-service downgrade counts seats, branches and patients, but never blocks on stored file volume', async () => {
    const currentTariff = baseTariff({ id: 'big', includedSeats: 5 });
    const targetTariff = baseTariff({
      id: 'small',
      includedSeats: 1,
      quotas: {
        branches: { kind: 'numeric', limit: 1, unit: 'items' },
        patient_count: { kind: 'numeric', limit: 2, unit: 'items', warningAtPercent: null },
        files: { kind: 'numeric', limit: 100, unit: 'bytes', warningAtPercent: null },
      },
      downgradePolicies: { branches: 'block', patient_count: 'block', files: 'block' },
    });
    const port: OrgEntitlementsPort = {
      resolveCabinetAccess: async () => ({ state: 'full_access', policySource: 'system', warning: null }),
      resolveMechanicAccess: async (_organizationId, mechanic) => ({ mechanic, state: 'full_access', policySource: 'system', warning: null }),
      getSnapshot: async () => ({ tariff: currentTariff, overrides: [], access: activeAccess }),
      getTariffForOrg: async () => currentTariff,
      getActiveTariffById: async (tariffId) =>
        tariffId === targetTariff.id
          ? targetTariff
          : tariffId === currentTariff.id
            ? currentTariff
            : null,
      listOverrides: async () => [],
      getEffectiveCommercialAccess: async () => activeAccess,
      getEnforcedQuotaUsage: async () => ({}),
      getOwnQuotaUsage: async () => ({ clinic_team: 2, branches: 3, patient_count: 4, files: 999 }),
    };

    await expect(resolveOwnTariffTransition(port, 'org', targetTariff.id)).resolves.toEqual({
      currentTariffId: currentTariff.id,
      targetTariffId: targetTariff.id,
      appliesNextPeriod: true,
      blocks: [
        { mechanic: 'clinic_team', reason: 'quota_exceeded' },
        { mechanic: 'patient_count', reason: 'quota_exceeded' },
        { mechanic: 'branches', reason: 'quota_exceeded' },
      ],
    });
  });

  it('classifies a cheaper tariff as a next-period downgrade even when its entitlement shape is unchanged', async () => {
    const currentTariff = baseTariff({ id: 'expensive', priceMinor: 20_000, currency: 'RUB' });
    const targetTariff = baseTariff({ id: 'cheaper', priceMinor: 10_000, currency: 'RUB' });
    const port: OrgEntitlementsPort = {
      resolveCabinetAccess: async () => ({ state: 'full_access', policySource: 'system', warning: null }),
      resolveMechanicAccess: async (_organizationId, mechanic) => ({ mechanic, state: 'full_access', policySource: 'system', warning: null }),
      getSnapshot: async () => ({ tariff: currentTariff, overrides: [], access: activeAccess }),
      getTariffForOrg: async () => currentTariff,
      getActiveTariffById: async (tariffId) =>
        tariffId === targetTariff.id
          ? targetTariff
          : tariffId === currentTariff.id
            ? currentTariff
            : null,
      listOverrides: async () => [],
      getEffectiveCommercialAccess: async () => activeAccess,
      getEnforcedQuotaUsage: async () => ({}),
      getOwnQuotaUsage: async () => ({}),
    };

    await expect(resolveOwnTariffTransition(port, 'org', targetTariff.id)).resolves.toMatchObject({
      currentTariffId: currentTariff.id,
      targetTariffId: targetTariff.id,
      appliesNextPeriod: true,
    });
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
      scheduledTariff: null,
      isActive: true,
      effectiveAccess: { lifecycle: 'active', tariffId: input.currentTariff.id, source: 'assignment' },
      overrides: [],
      trial: null,
    };
    const port: PlatformEntitlementsPort = {
      ...PLATFORM_BILLING_PORT_STUBS,
      listTariffs: async () => [input.currentTariff, input.targetTariff],
      listOrganizations: async () => [organization],
      getTrialPolicy: async () => null,
      getRegistrationTariffPolicy: async () => ({ tariffId: null }),
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
      setRegistrationTariffPolicy: async () => {},
      startTrial: async () => null,
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
      quotas: { branches: { kind: 'numeric', limit: 1, unit: 'items' } },
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
      ...PLATFORM_BILLING_PORT_STUBS,
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      getRegistrationTariffPolicy: async () => ({ tariffId: null }),
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
      setRegistrationTariffPolicy: async () => {},
      startTrial: async () => null,
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
          systemAccessPolicy: { graceDays: 1, readOnlyDays: 1, notifications: [], terminalState: 'full_access' },
          mechanicAccessPolicies: {},
          downgradePolicies: {},
          mailingTemplates: [],
          includedSeats: 1,
          additionalSeatPriceMinor: null,
          discountedPriceMinor: null,
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
      mailingTemplates: [],
      includedSeats: 1,
      additionalSeatPriceMinor: null,
      discountedPriceMinor: null,
      isActive: true,
      ...overrides,
    };
  }

  function servicePort(): PlatformEntitlementsPort {
    return {
      ...PLATFORM_BILLING_PORT_STUBS,
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      getRegistrationTariffPolicy: async () => ({ tariffId: null }),
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
      setRegistrationTariffPolicy: async () => {},
      startTrial: async () => null,
    };
  }

  it('there really are critical mechanics to check (a canon list, not an accidentally empty one)', () => {
    expect(criticalMechanics()).toEqual(
      expect.arrayContaining(['patient_card', 'patient_app', 'patient_diaries']),
    );
  });

  it('strips per-mechanic ladder policies on save (#1069 T1, owner 05.08)', async () => {
    const service = createPlatformEntitlementsService(servicePort());
    const tariff = await service.createTariff(
      baseTariffInput({
        mechanicAccessPolicies: {
          branding: {
            graceDays: 1,
            readOnlyDays: 1,
            notifications: [],
            terminalState: 'read_only',
          },
        },
      }),
      { actorId: null, reason: '' },
    );
    expect(tariff.mechanicAccessPolicies).toEqual({});
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
        access: { lifecycle: 'blocked' as const, tariffId: null, source: 'assignment' as const },
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
      ...PLATFORM_BILLING_PORT_STUBS,
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      getRegistrationTariffPolicy: async () => ({ tariffId: null }),
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
      setRegistrationTariffPolicy: async () => {},
      startTrial: async () => null,
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
      resolveCabinetAccess: async () => ({
        state: 'full_access' as const,
        policySource: 'system' as const,
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
      getActiveTariffById: async () => null,
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

/**
 * §5a items 2.6 / 2.6a — снятие агентских констант. Each test here names one owner decision from
 * 31.07 and the breakage that would put the agent's choice back in place of his value.
 */
describe('§5a item 2.6a — the owner sets the value, the code only refuses what he did not set', () => {
  function tariffInput(
    overrides: Partial<Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>> = {},
  ): Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: 'Тест',
      description: '',
      priceMinor: null,
      currency: null,
      billingPeriod: 'month',
      mechanics: {},
      quotas: {},
      systemAccessPolicy: null,
      mechanicAccessPolicies: {},
      downgradePolicies: {},
      mailingTemplates: [],
      includedSeats: 1,
      additionalSeatPriceMinor: null,
      discountedPriceMinor: null,
      isActive: true,
      ...overrides,
    };
  }

  let written: Array<Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>>;

  function service() {
    written = [];
    const port = {
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => null,
      getRegistrationTariffPolicy: async () => ({ tariffId: null }),
      getOrganizationMechanicUsage: async () => ({}),
      createTariff: async (input: Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>) => {
        written.push(input);
        return {
          ...input,
          id: 'x',
          createdAt: '2026-07-31T00:00:00.000Z',
          updatedAt: '2026-07-31T00:00:00.000Z',
        };
      },
      updateTariff: async () => {
        throw new Error('not_used');
      },
      archiveTariff: async () => {},
      assignTariff: async () => {},
      upsertOverride: async () => {},
      deleteOverride: async () => {},
      setTrialPolicy: async () => {},
      setRegistrationTariffPolicy: async () => {},
      startTrial: async () => null,
    } as unknown as PlatformEntitlementsPort;
    return createPlatformEntitlementsService(port);
  }

  // Owner 31.07: «количество разрешённых специалистов должно быть явно настроено в тарифе, иначе
  // он не сохранится». Breakage: the refusal is replaced by a runtime substitution, so a tariff
  // with no seat count is saved and some baseline is invented on read.
  it('refuses to SAVE a tariff without a specialist seat count', () => {
    expect(() =>
      service().createTariff(tariffInput({ includedSeats: null }), { actorId: null, reason: '' }),
    ).toThrow('tariff_included_seats_required');
  });

  it('saves the seat count the owner set, including zero', async () => {
    const created = await service().createTariff(tariffInput({ includedSeats: 0 }), {
      actorId: null,
      reason: '',
    });
    expect(created.includedSeats).toBe(0);
  });

  // Owner 31.07: «процент для предупреждения надо считать только от количества доступных клиентов
  // и объёма файлов». Breakage: a threshold reappears on branches — either accepted and silently
  // ignored, or accepted and acted upon, both of which are the agent deciding.
  it('refuses an early-warning threshold on branches and keeps it for patients and files', async () => {
    expect(() =>
      service().createTariff(
        tariffInput({
          quotas: {
            branches: { kind: 'numeric', limit: 2, unit: 'items', warningAtPercent: 80 } as never,
          },
        }),
        { actorId: null, reason: '' },
      ),
    ).toThrow('tariff_quota_warning_unsupported');

    const created = await service().createTariff(
      tariffInput({
        quotas: {
          patient_count: { kind: 'numeric', limit: 100, unit: 'items', warningAtPercent: 80 },
          files: { kind: 'numeric', limit: 1024, unit: 'bytes', warningAtPercent: 90 },
          branches: { kind: 'numeric', limit: 2, unit: 'items' },
        },
      }),
      { actorId: null, reason: '' },
    );
    expect(created.quotas.patient_count?.warningAtPercent).toBe(80);
    expect(created.quotas.files?.warningAtPercent).toBe(90);
    expect(created.quotas.branches).toEqual({ kind: 'numeric', limit: 2, unit: 'items' });
  });

  // Breakage: the notification list stops being pass-through data — a row is dropped, reordered,
  // its text rewritten, or a maximum count creeps in. §T3 — every row here has no `templateId`,
  // so `template` is the pre-Т3 case: carried through exactly as sent, never blanked.
  it('stores the owner notification rows verbatim, however many he wrote', async () => {
    const notifications = Array.from({ length: 7 }, (_unused, index) => ({
      offsetDays: index - 3,
      condition: index % 2 === 0 ? ('payment_failed' as const) : ('payment_succeeded' as const),
      templateId: null,
      template: `Текст ${index} про {{тариф}}`,
    }));
    const created = await service().createTariff(
      tariffInput({
        systemAccessPolicy: { graceDays: 3, readOnlyDays: 2, notifications, terminalState: 'disabled' },
      }),
      { actorId: null, reason: '' },
    );
    expect(created.systemAccessPolicy?.notifications).toEqual(notifications);
  });

  it.each([
    [
      'access_notification_offset_invalid',
      { offsetDays: 1.5, condition: 'payment_failed' as const, templateId: null, template: 'т' },
    ],
    [
      'access_notification_condition_invalid',
      { offsetDays: 1, condition: 'выдумка', templateId: null, template: 'т' },
    ],
    [
      'access_notification_template_id_invalid',
      { offsetDays: 1, condition: 'payment_failed' as const, templateId: 42, template: 'т' },
    ],
  ])('refuses a malformed notification row with %s', (error, row) => {
    expect(() =>
      service().createTariff(
        tariffInput({
          systemAccessPolicy: {
            graceDays: 1,
            readOnlyDays: 1,
            notifications: [row as never],
            terminalState: 'disabled',
          },
        }),
        { actorId: null, reason: '' },
      ),
    ).toThrow(error);
  });

  // §T3 — a rule POINTS AT a template; a row cannot save while its reference resolves to nothing.
  it('refuses a notification row whose templateId names no template on the tariff', () => {
    expect(() =>
      service().createTariff(
        tariffInput({
          mailingTemplates: [{ id: 'letter-1', name: 'Письмо', subject: '', body: '' }],
          systemAccessPolicy: {
            graceDays: 1,
            readOnlyDays: 1,
            notifications: [
              { offsetDays: 1, condition: 'payment_failed', templateId: 'letter-missing', template: '' },
            ],
            terminalState: 'disabled',
          },
        }),
        { actorId: null, reason: '' },
      ),
    ).toThrow('access_notification_template_not_found');
  });

  // §T3 boundary #4 — a rule with no template chosen keeps saving exactly as before.
  it('saves a notification row with no template chosen', async () => {
    const created = await service().createTariff(
      tariffInput({
        systemAccessPolicy: {
          graceDays: 1,
          readOnlyDays: 1,
          notifications: [
            { offsetDays: 1, condition: 'payment_failed', templateId: null, template: '' },
          ],
          terminalState: 'disabled',
        },
      }),
      { actorId: null, reason: '' },
    );
    expect(created.systemAccessPolicy?.notifications).toEqual([
      { offsetDays: 1, condition: 'payment_failed', templateId: null, template: '' },
    ]);
  });

  // §T3 — the rule POINTS AT the template; its CURRENT body is what gets stored, not a copy typed
  // into the rule. Editing the letter (a second `updateTariff`) must reach the rule automatically.
  it('resolves a chosen templateId to that template\'s current body', async () => {
    const svc = createPlatformEntitlementsService(createInMemoryPlatformEntitlementsPort());
    const created = await svc.createTariff(
      tariffInput({
        mailingTemplates: [
          { id: 'letter-1', name: 'Напоминание', subject: 'Тема', body: 'Текст про {{тариф}}' },
        ],
        systemAccessPolicy: {
          graceDays: 1,
          readOnlyDays: 1,
          notifications: [
            { offsetDays: -3, condition: 'payment_failed', templateId: 'letter-1', template: '' },
          ],
          terminalState: 'disabled',
        },
      }),
      { actorId: null, reason: '' },
    );
    expect(created.systemAccessPolicy?.notifications).toEqual([
      {
        offsetDays: -3,
        condition: 'payment_failed',
        templateId: 'letter-1',
        template: 'Текст про {{тариф}}',
      },
    ]);

    // Editing the letter and re-saving the tariff must reach the rule with no rule edit at all.
    const updated = await svc.updateTariff(
      created.id,
      tariffInput({
        mailingTemplates: [
          { id: 'letter-1', name: 'Напоминание', subject: 'Тема', body: 'Новый текст' },
        ],
        systemAccessPolicy: created.systemAccessPolicy!,
      }),
      { actorId: null, reason: '' },
    );
    expect(updated.systemAccessPolicy?.notifications[0]?.template).toBe('Новый текст');
  });

  it.each([
    ['mailing_template_id_required', [{ id: '  ', name: 'Т', subject: '', body: '' }]],
    ['mailing_template_name_required', [{ id: 'x', name: '  ', subject: '', body: '' }]],
    [
      'mailing_template_id_duplicate',
      [
        { id: 'x', name: 'Один', subject: '', body: '' },
        { id: 'x', name: 'Два', subject: '', body: '' },
      ],
    ],
  ])('refuses a malformed mailing template with %s', (error, mailingTemplates) => {
    expect(() =>
      service().createTariff(tariffInput({ mailingTemplates }), { actorId: null, reason: '' }),
    ).toThrow(error);
  });
});

/**
 * §5a item 2.6a — жизненный цикл тарифа у клиники (owner 31.07, dictated verbatim into the canon).
 * #1069 §2.13 (owner 01.08) removed the "compatibility" carve-out entirely, so the state left to
 * pin is the one an agent is still tempted to "helpfully" soften: full access without a tariff.
 */
describe('§5a item 2.6a / #1069 §2.13 — клиники без тарифа не существует', () => {
  const noTariffSnapshot = () => ({
    tariff: null,
    overrides: [],
    access: { lifecycle: 'active' as const, tariffId: null, source: 'assignment' as const },
  });

  // Owner 31.07: «просто сразу требуется выбор тарифа и оплата… без выбора тарифа и без оплаты —
  // нет доступа». Owner 01.08 (#1069 §2.13): «нет активного тарифа и нет триала → доступа нет» —
  // no compatibility carve-out survives. Breakage: the "no tariff" state starts handing out a
  // default set of mechanics.
  it('gives no mechanic at all when there is neither an active tariff nor a trial', () => {
    const entitlements = entitlementsFromSnapshot(noTariffSnapshot());
    for (const mechanic of MECHANICS) {
      // Critical mechanics are never a tariff option; everything else must be off.
      const expected = MECHANIC_REGISTRY[mechanic].class === 'никогда';
      expect(entitlements[mechanic], mechanic).toBe(expected);
    }
    expect(fileStorageLimitFromSnapshot(noTariffSnapshot())).toBeUndefined();
  });

  // Owner 31.07: «нет ни активного тарифа, ни триала уже повторного» — entry to the product is
  // closed. Breakage: the cabinet gate stops treating an unconfigured ladder as closed.
  it('closes cabinet entry when the ladder has no tariff to resolve', () => {
    expect(
      isCabinetEntryBlocked({ state: 'unconfigured', policySource: 'unconfigured', warning: null }),
    ).toBe(true);
    expect(
      isCabinetEntryBlocked({ state: 'disabled', policySource: 'system', warning: null }),
    ).toBe(true);
    expect(
      isCabinetEntryBlocked({ state: 'full_access', policySource: 'system', warning: null }),
    ).toBe(false);
  });
});

/**
 * §5a item 2.6a — «стартовый тариф с триалом настраивается в админке» (owner 31.07). The trial
 * policy is a stored record, so its duration, discount window and what happens afterwards are all
 * operator values (Т5, owner 03.08: the trial no longer carries its own tariff — see
 * saas_registration_tariff_policy for the separate "which tariff" setting). These tests pin that
 * nothing here is chosen in code.
 */
describe('§5a item 2.6a — политика триала настраивается, а не зашита', () => {
  function trialPort(saved: TrialPolicy[]): PlatformEntitlementsPort {
    return {
      listTariffs: async () => [],
      listOrganizations: async () => [],
      getTrialPolicy: async () => saved[saved.length - 1] ?? null,
      getOrganizationMechanicUsage: async () => ({}),
      createTariff: async () => {
        throw new Error('not_used');
      },
      updateTariff: async () => {
        throw new Error('not_used');
      },
      archiveTariff: async () => {},
      assignTariff: async () => {},
      upsertOverride: async () => {},
      deleteOverride: async () => {},
      setTrialPolicy: async (policy: TrialPolicy) => {
        saved.push(policy);
      },
      startTrial: async () => null,
    } as unknown as PlatformEntitlementsPort;
  }

  const policy = (overrides: Partial<TrialPolicy> = {}): TrialPolicy => ({
    durationDays: 21,
    discountWindowDays: 5,
    startEvent: 'organization_created',
    postTrialBehavior: 'read_only',
    postTrialTariffId: null,
    isActive: true,
    ...overrides,
  });

  // Breakage: the trial length, discount window or its post-trial behaviour stops round-tripping —
  // i.e. something in code decides it instead of the admin screen.
  it('stores the trial length, discount window and post-trial behaviour as operator values', async () => {
    const saved: TrialPolicy[] = [];
    const service = createPlatformEntitlementsService(trialPort(saved));

    await service.setTrialPolicy(policy(), { actorId: 'admin', reason: '' });
    expect(await service.getTrialPolicy()).toEqual(policy());

    const other = policy({
      durationDays: 3,
      discountWindowDays: 10,
      postTrialBehavior: 'tariff',
      postTrialTariffId: '95200000-0000-4000-8000-000000000077',
    });
    await service.setTrialPolicy(other, { actorId: 'admin', reason: '' });
    expect(await service.getTrialPolicy()).toEqual(other);
  });

  // Breakage: a missing trial length, discount window or start event is filled in by the code
  // instead of refused.
  it.each([
    ['trial_duration_invalid', policy({ durationDays: 0 })],
    ['trial_discount_window_invalid', policy({ discountWindowDays: -1 })],
    ['trial_start_event_required', policy({ startEvent: '  ' })],
    ['trial_post_tariff_required', policy({ postTrialBehavior: 'tariff', postTrialTariffId: null })],
  ])('refuses an unset trial value with %s', async (error, invalid) => {
    const service = createPlatformEntitlementsService(trialPort([]));
    expect(() => service.setTrialPolicy(invalid, { actorId: 'admin', reason: '' })).toThrow(error);
  });
});

describe('§5a #1069 Т5 (owner 03.08) — the trial is one-time per organization, on whatever tariff it has', () => {
  const tariffInput = (
    overrides: Partial<Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>> = {},
  ): Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'> => ({
    name: 'Т',
    description: '',
    priceMinor: 1000,
    currency: 'RUB',
    billingPeriod: 'month',
    mechanics: {},
    quotas: {},
    systemAccessPolicy: null,
    mechanicAccessPolicies: {},
    downgradePolicies: {},
    mailingTemplates: [],
    includedSeats: 1,
    additionalSeatPriceMinor: null,
    discountedPriceMinor: null,
    isActive: true,
    ...overrides,
  });

  // Breakage: an organization that already used its one trial gets a second one after it is
  // assigned or chooses a DIFFERENT tariff — i.e. the trial re-fires per tariff instead of once
  // per organization.
  it('does not start a second trial once the organization already has one, even on a later, different tariff', async () => {
    const service = createPlatformEntitlementsService(createInMemoryPlatformEntitlementsPort());
    const audit = { actorId: 'admin', reason: '' };
    const organizationId = 'org-1';

    const firstTariff = await service.createTariff(tariffInput({ name: 'First' }), audit);
    const secondTariff = await service.createTariff(tariffInput({ name: 'Second' }), audit);
    await service.setTrialPolicy(
      {
        durationDays: 14,
        discountWindowDays: 3,
        startEvent: 'organization_provisioned',
        postTrialBehavior: 'blocked',
        postTrialTariffId: null,
        isActive: true,
      },
      audit,
    );

    await service.assignTariff(organizationId, firstTariff.id, audit);
    const started = await service.startTrial(organizationId, audit);
    expect(started?.created).toBe(true);

    // The organization's first tariff changes — the person picked (or was assigned) a different
    // one. This must NOT be a second trial: every later tariff is paid immediately.
    await service.assignTariff(organizationId, secondTariff.id, audit);
    const secondAttempt = await service.startTrial(organizationId, audit);

    expect(secondAttempt?.created).toBe(false);
    expect(secondAttempt?.endsAt).toBe(started?.endsAt);
  });
});

describe('§5a #1069 Т8 (owner 03.08) — discounted price is explicit per tariff, no percent fallback', () => {
  function tariffInput(
    overrides: Partial<Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'>> = {},
  ): Omit<Tariff, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: 'Тест',
      description: '',
      priceMinor: 1000,
      currency: 'RUB',
      billingPeriod: 'month',
      mechanics: {},
      quotas: {},
      systemAccessPolicy: null,
      mechanicAccessPolicies: {},
      downgradePolicies: {},
      mailingTemplates: [],
      includedSeats: 1,
      additionalSeatPriceMinor: null,
      discountedPriceMinor: null,
      isActive: true,
      ...overrides,
    };
  }

  // Breakage: a tariff without an explicit discounted price gets one anyway (a global percent
  // fallback reappearing) — the owner closed that: "тарифов всё-таки 3-4, а не десятки".
  it('gives no discount when the tariff has no explicit discounted price, and stores an explicit one', async () => {
    const service = createPlatformEntitlementsService(createInMemoryPlatformEntitlementsPort());
    const audit = { actorId: 'admin', reason: '' };

    const withoutDiscount = await service.createTariff(tariffInput(), audit);
    expect(withoutDiscount.discountedPriceMinor).toBeNull();

    const withDiscount = await service.createTariff(
      tariffInput({ discountedPriceMinor: 700 }),
      audit,
    );
    expect(withDiscount.discountedPriceMinor).toBe(700);
  });

  it('refuses a negative discounted price instead of silently clamping it', () => {
    const service = createPlatformEntitlementsService(createInMemoryPlatformEntitlementsPort());
    expect(() =>
      service.createTariff(tariffInput({ discountedPriceMinor: -1 }), {
        actorId: 'admin',
        reason: '',
      }),
    ).toThrow('tariff_discounted_price_invalid');
  });
});
