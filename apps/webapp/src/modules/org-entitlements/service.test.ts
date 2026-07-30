import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import {
  createPlatformEntitlementsService,
  entitlementsFromSnapshot,
  resolveClinicSeatLimit,
  resolveOrgQuotaProjections,
} from '@/modules/org-entitlements/service';
import type { OrgEntitlementsPort, PlatformEntitlementsPort } from '@/modules/org-entitlements/ports';
import { MECHANICS, type MechanicDefinition, type Tariff } from '@/modules/org-entitlements/types';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));

const activeAccess = { lifecycle: 'active' as const, tariffId: 'tariff', source: 'assignment' as const };

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
            files: { kind: 'numeric', limit: 10, unit: 'bytes' },
            courses: { kind: 'numeric', limit: 1, unit: 'bytes' },
            patient_app: { kind: 'numeric', limit: 1, unit: 'bytes' },
          } as never,
          includedSeats: null,
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
    vi.mocked(buildAppDeps).mockReturnValue({ orgEntitlements: port } as ReturnType<typeof buildAppDeps>);
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
        quotas: { files: { kind: 'numeric', limit: 1024, unit: 'bytes' } },
        includedSeats: 3,
        isActive: true,
      },
      { actorId: 'admin', reason: '' },
    );
    const assignedPort: OrgEntitlementsPort = {
      getSnapshot: async () => ({
        tariff: { mechanics: tariff.mechanics, quotas: tariff.quotas, includedSeats: tariff.includedSeats },
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
    await expect(requireEntitlementForMutation({ organizationId: 'org' }, 'files')).resolves.toEqual({
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
