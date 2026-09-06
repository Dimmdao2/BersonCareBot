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
      deductionMode: 'manual',
      isActive: true,
      items: [],
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
  } as unknown as MembershipsPort;
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

/**
 * Подтверждённый дефект (worker-отчёт df87839fe): ветку абонементов выбирало НАЛИЧИЕ пациентских
 * definer-корней, а не ПРАВО ими воспользоваться. Врач, записывающий пациента, попадал в
 * `*Current*`-корень, который принимает только пациентский контекст, и получал
 * `patient_principal_required` — запись не создавалась вовсе.
 *
 * Что сломается без этих утверждений: любой персонал, создающий запись пациенту с абонементом,
 * снова уходит в пациентский корень (503 `appointment_create_unavailable`), либо — в обратную
 * сторону — сам пациент перестаёт попадать в свой корень и уходит на org-scoped путь, которого у
 * роли `app_patient` нет. Оракул — решение владельца о стене пациента и текст дефекта, не форма
 * реализации.
 */
describe('memberships service — ветку выбирает право, а не наличие пациентского корня', () => {
  const PATIENT_ID = '22222222-2222-4222-8222-222222222222';

  function buildDispatch(canActAsCurrentPatient: (id: string) => boolean) {
    const listCurrentPatientBookingPackages = vi.fn(async () => []);
    const reserveCurrentPatientBookingPackage = vi.fn(async () => ({ id: 'usage-patient' }));
    const listPatientPackagesForUser = vi.fn(async () => []);
    const runWithPackageLock = vi.fn(async () => ({ id: 'usage-staff' }));
    const port = {
      canActAsCurrentPatient,
      listCurrentPatientBookingPackages,
      reserveCurrentPatientBookingPackage,
      listPatientPackagesForUser,
      runWithPackageLock,
      getPatientPackage: vi.fn(async () => null),
      listUsagesForPackage: vi.fn(async () => []),
      appendUsage: vi.fn(),
      appendHistoryEvent: vi.fn(),
      setAppointmentPackageUsageRef: vi.fn(),
    } as unknown as MembershipsPort;
    const service = createMembershipsService({
      port,
      payments: null,
      bookingEngine: null,
      assertWriteClearance: assertMechanicWriteClearance,
    });
    return {
      service,
      listCurrentPatientBookingPackages,
      reserveCurrentPatientBookingPackage,
      listPatientPackagesForUser,
      runWithPackageLock,
    };
  }

  it('персонал не трогает пациентский корень ни на чтении, ни на списании', async () => {
    const d = buildDispatch(() => false);

    await d.service.pickAutoPackageForBooking(PATIENT_ID, ORG_ID, 'svc-1');
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('subscriptions');
      await d.service.reserveForAppointment({
        organizationId: ORG_ID,
        patientPackageId: 'pkg-1',
        serviceId: 'svc-1',
        appointmentId: 'appt-1',
        platformUserId: PATIENT_ID,
      });
    });

    expect(d.listCurrentPatientBookingPackages).not.toHaveBeenCalled();
    expect(d.reserveCurrentPatientBookingPackage).not.toHaveBeenCalled();
    expect(d.listPatientPackagesForUser).toHaveBeenCalledWith(PATIENT_ID, ORG_ID, ['active']);
    expect(d.runWithPackageLock).toHaveBeenCalledOnce();
  });

  it('сам пациент по-прежнему идёт своим корнем, а не org-scoped путём', async () => {
    const d = buildDispatch((id) => id === PATIENT_ID);

    await d.service.pickAutoPackageForBooking(PATIENT_ID, ORG_ID, 'svc-1');
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('subscriptions');
      await d.service.reserveForAppointment({
        organizationId: ORG_ID,
        patientPackageId: 'pkg-1',
        serviceId: 'svc-1',
        appointmentId: 'appt-1',
        platformUserId: PATIENT_ID,
      });
    });

    expect(d.listCurrentPatientBookingPackages).toHaveBeenCalledOnce();
    expect(d.reserveCurrentPatientBookingPackage).toHaveBeenCalledOnce();
    expect(d.listPatientPackagesForUser).not.toHaveBeenCalled();
    expect(d.runWithPackageLock).not.toHaveBeenCalled();
  });
});
