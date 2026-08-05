import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createMembershipsService } from './service';
import type { MembershipsPort } from './ports';
import type { SubscriptionPackageRecord } from './types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function buildService() {
  const upsertCatalogPackage = vi.fn(
    async (): Promise<SubscriptionPackageRecord> => ({
      id: 'pkg-catalog-1',
      organizationId: ORG_ID,
      title: 'Абонемент',
      description: null,
      priceMinor: 1000,
      currency: 'RUB',
      validityDays: 30,
      isActive: true,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  const port = {
    upsertCatalogPackage,
    listCatalogPackages: vi.fn(async () => []),
    getCatalogPackage: vi.fn(async () => null),
    listPatientPackagesForUser: vi.fn(async () => []),
    getPatientPackage: vi.fn(async () => null),
    createManualPatientPackage: vi.fn(),
    offerCatalogPackageToPatient: vi.fn(),
    appendHistoryEvent: vi.fn(),
    listUsagesForPackage: vi.fn(async () => []),
    listHistoryForPackage: vi.fn(async () => []),
    setPatientPackageStatus: vi.fn(),
    appendUsage: vi.fn(),
    listUsagesForAppointment: vi.fn(async () => []),
    runWithPackageLock: vi.fn(),
    updatePatientPackageNotes: vi.fn(),
  } satisfies Partial<MembershipsPort> as MembershipsPort;
  const service = createMembershipsService({
    port,
    payments: null,
    bookingEngine: null,
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, upsertCatalogPackage };
}

describe('memberships service — 3.2 physical door (subscriptions)', () => {
  it('refuses upsertCatalogPackage when no subscriptions mutation decision ran first', async () => {
    const { service, upsertCatalogPackage } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.upsertCatalogPackage({
          organizationId: ORG_ID,
          title: 'Абонемент',
          description: null,
          priceMinor: 1000,
          currency: 'RUB',
          validityDays: 30,
          isActive: true,
          items: [],
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(upsertCatalogPackage).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared subscriptions for this continuation', async () => {
    const { service, upsertCatalogPackage } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('subscriptions');
      const pkg = await service.upsertCatalogPackage({
        organizationId: ORG_ID,
        title: 'Абонемент',
        description: null,
        priceMinor: 1000,
        currency: 'RUB',
        validityDays: 30,
        isActive: true,
        items: [],
      });
      expect(pkg.id).toBe('pkg-catalog-1');
    });
    expect(upsertCatalogPackage).toHaveBeenCalledOnce();
  });
});
