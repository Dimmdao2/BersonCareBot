import { describe, expect, it } from 'vitest';
import type { CanonicalBookingDeps } from './canonicalCreate';
import { createBookingOnCanonicalEngine } from './canonicalCreate';
import type { PatientBookingRecord } from './types';
import type { MembershipsPort } from '@/modules/memberships/ports';
import { createMembershipsService } from '@/modules/memberships/service';
import type {
  PackageUsageRecord,
  PatientPackageRecord,
} from '@/modules/memberships/types';
import type { PaymentsService } from '@/modules/payments/service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const BRANCH_ID = '00000000-0000-4000-8000-000000000002';
const SERVICE_ID = '00000000-0000-4000-8000-000000000003';
const SPECIALIST_ID = '00000000-0000-4000-8000-000000000004';
const PATIENT_ID = '00000000-0000-4000-8000-000000000005';
const PACKAGE_ID = '00000000-0000-4000-8000-000000000006';
const PACKAGE_ITEM_ID = '00000000-0000-4000-8000-000000000007';
const SUBSCRIPTION_PACKAGE_ID = '00000000-0000-4000-8000-000000000008';
const APPOINTMENT_ID = '00000000-0000-4000-8000-000000000009';

function bookingRecord(
  overrides: Partial<PatientBookingRecord> = {},
): PatientBookingRecord {
  return {
    id: 'booking-1',
    userId: PATIENT_ID,
    bookingType: 'in_person',
    city: 'msk',
    category: 'general',
    slotStart: '2027-03-10T09:00:00.000Z',
    slotEnd: '2027-03-10T10:00:00.000Z',
    status: 'creating',
    cancelledAt: null,
    cancelReason: null,
    gcalEventId: null,
    contactPhone: '+79990000000',
    contactEmail: null,
    contactName: 'Пациент',
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: '2027-03-01T00:00:00.000Z',
    updatedAt: '2027-03-01T00:00:00.000Z',
    branchServiceId: null,
    branchId: null,
    serviceId: null,
    cityCodeSnapshot: 'msk',
    branchTitleSnapshot: 'Клиника',
    serviceTitleSnapshot: 'Приём',
    durationMinutesSnapshot: 60,
    priceMinorSnapshot: 5_000,
    canonicalAppointmentId: null,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    ...overrides,
  };
}

function bookingDeps(): CanonicalBookingDeps {
  let stored = bookingRecord();
  return {
    bookingsPort: {
      async createPending() {
        return stored;
      },
      async markConfirmed(
        _bookingId: string,
        options?: { canonicalAppointmentId?: string | null },
      ) {
        stored = bookingRecord({
          status: 'confirmed',
          canonicalAppointmentId: options?.canonicalAppointmentId ?? null,
        });
        return stored;
      },
      async markFailedSync() {},
    } as unknown as CanonicalBookingDeps['bookingsPort'],
    syncPort: {
      async emitBookingEvent() {},
    },
    bookingEngine: {
      catalog: {
        async getBranch() {
          return {
            id: BRANCH_ID,
            organizationId: ORGANIZATION_ID,
            title: 'Клиника',
            shortTitle: null,
            color: null,
            cityCode: 'msk',
            address: null,
            timezone: 'Europe/Moscow',
            isActive: true,
            sortOrder: 0,
          };
        },
      },
      services: {
        async getService() {
          return {
            id: SERVICE_ID,
            organizationId: ORGANIZATION_ID,
            title: 'Приём',
            description: null,
            durationMinutes: 60,
            bufferAfterMinutes: 0,
            priceMinor: 5_000,
            isActive: true,
            prepaymentApplicable: false,
            usableInPackages: true,
            onlinePaymentApplicable: false,
            publicWidgetVisible: true,
            adminManualOnly: false,
            sortOrder: 0,
          };
        },
      },
      async createAppointment(input: {
        startAt: string;
        endAt: string;
        durationMinutes: number;
        source: 'native' | 'public_widget';
      }) {
        return {
          id: APPOINTMENT_ID,
          organizationId: ORGANIZATION_ID,
          branchId: BRANCH_ID,
          roomId: null,
          specialistId: SPECIALIST_ID,
          serviceId: SERVICE_ID,
          platformUserId: PATIENT_ID,
          startAt: input.startAt,
          endAt: input.endAt,
          durationMinutes: input.durationMinutes,
          source: input.source,
          status: 'confirmed',
          originalStartAt: null,
          rescheduleCount: 0,
          paymentRef: null,
          packageUsageRef: null,
          phoneNormalized: '+79990000000',
          attributionJson: {},
        };
      },
    } as unknown as CanonicalBookingDeps['bookingEngine'],
    bookingScheduling: {
      async resolveCanonicalInPersonContext() {
        return {
          organizationId: ORGANIZATION_ID,
          branchId: BRANCH_ID,
          specialistId: SPECIALIST_ID,
          serviceId: SERVICE_ID,
          roomId: null,
          durationMinutes: 60,
          bufferAfterMinutes: 0,
          branchTimezone: 'Europe/Moscow',
        };
      },
      async assertSlotAvailable() {},
      async getMaxConsecutiveSlotHours() {
        return 8;
      },
    } as unknown as CanonicalBookingDeps['bookingScheduling'],
    bookingForm: null,
    appointmentProjection: null,
    payments: null,
    canAcceptBookingPrepayment: async () => false,
    memberships: null,
    clientHistory: null,
  };
}

function membershipsHarness() {
  let usageSequence = 0;
  let patientPackage: PatientPackageRecord = {
    id: PACKAGE_ID,
    organizationId: ORGANIZATION_ID,
    platformUserId: PATIENT_ID,
    subscriptionPackageId: SUBSCRIPTION_PACKAGE_ID,
    status: 'offered',
    displayNumber: 1,
    title: 'Два приёма',
    priceMinor: 10_000,
    currency: 'RUB',
    validityDays: 90,
    validFrom: null,
    validUntil: null,
    deductionMode: 'auto_on_visit_confirmed',
    paymentIntentId: null,
    paymentRef: null,
    soldAt: null,
    paidAmountMinor: null,
    paidCurrency: null,
    createdAt: '2027-03-01T00:00:00.000Z',
    notes: null,
    items: [
      {
        id: PACKAGE_ITEM_ID,
        serviceId: SERVICE_ID,
        quantityInitial: 2,
        sortOrder: 0,
      },
    ],
  };
  const usages: PackageUsageRecord[] = [];
  const history: Array<{
    id: string;
    eventType: string;
    payloadJson: Record<string, unknown>;
    occurredAt: string;
  }> = [];
  const appointmentUsageRefs = new Map<string, string | null>();

  function appendUsage(input: {
    patientPackageId: string;
    patientPackageItemId: string;
    appointmentId?: string | null;
    usageKind: PackageUsageRecord['usageKind'];
    quantity?: number;
    comment?: string | null;
  }): PackageUsageRecord {
    usageSequence += 1;
    const usage: PackageUsageRecord = {
      id: `usage-${usageSequence}`,
      patientPackageId: input.patientPackageId,
      patientPackageItemId: input.patientPackageItemId,
      appointmentId: input.appointmentId ?? null,
      usageKind: input.usageKind,
      quantity: input.quantity ?? 1,
      comment: input.comment ?? null,
      occurredAt: `2027-03-10T10:0${usageSequence}:00.000Z`,
    };
    usages.push(usage);
    return usage;
  }

  const port = {
    async resolveCatalogPackageOrganizationId(id: string) {
      return id === SUBSCRIPTION_PACKAGE_ID ? ORGANIZATION_ID : null;
    },
    async offerCatalogPackageToPatient() {
      return patientPackage;
    },
    async getPatientPackage(id: string, organizationId: string) {
      return id === PACKAGE_ID && organizationId === ORGANIZATION_ID ? patientPackage : null;
    },
    async setPatientPackageStatus(
      id: string,
      organizationId: string,
      status: PatientPackageRecord['status'],
      patch?: Partial<{
        paymentIntentId: string | null;
        paymentRef: string | null;
        validFrom: string | null;
        validUntil: string | null;
        soldAt: string | null;
        paidAmountMinor: number | null;
        paidCurrency: string | null;
      }>,
    ) {
      if (id !== PACKAGE_ID || organizationId !== ORGANIZATION_ID) return null;
      patientPackage = { ...patientPackage, status, ...patch };
      return patientPackage;
    },
    async appendHistoryEvent(input: {
      eventType: string;
      payloadJson?: Record<string, unknown>;
    }) {
      history.push({
        id: `history-${history.length + 1}`,
        eventType: input.eventType,
        payloadJson: input.payloadJson ?? {},
        occurredAt: '2027-03-10T10:00:00.000Z',
      });
    },
    async listHistoryForPackage() {
      return history;
    },
    async listUsagesForPackage() {
      return usages;
    },
    async listUsagesForAppointment(appointmentId: string, organizationId: string) {
      if (organizationId !== ORGANIZATION_ID) return [];
      return usages.filter((usage) => usage.appointmentId === appointmentId);
    },
    async runWithPackageLock<T>(
      _patientPackageId: string,
      _organizationId: string,
      fn: () => Promise<T>,
    ) {
      return fn();
    },
    async appendUsage(input: Parameters<MembershipsPort['appendUsage']>[0]) {
      return appendUsage(input);
    },
    async setAppointmentPackageUsageRef(appointmentId: string, usageRef: string | null) {
      appointmentUsageRefs.set(appointmentId, usageRef);
    },
    async recordReservedAppointmentDebit(
      input: Parameters<MembershipsPort['recordReservedAppointmentDebit']>[0],
    ) {
      const debit = appendUsage({
        ...input,
        usageKind: input.usageKind,
      });
      appendUsage({
        ...input,
        usageKind: 'release',
      });
      appointmentUsageRefs.set(input.appointmentId, debit.id);
      history.push({
        id: `history-${history.length + 1}`,
        eventType: input.eventType,
        payloadJson: { appointmentId: input.appointmentId, usageId: debit.id },
        occurredAt: '2027-03-10T10:00:00.000Z',
      });
      return debit;
    },
  } as unknown as MembershipsPort;

  const payments = {
    async createPackagePaymentIntent() {
      return {
        id: 'intent-1',
        checkoutUrl: 'https://payments.example.test/intent-1',
      };
    },
  } as unknown as PaymentsService;

  const service = createMembershipsService({
    port,
    payments,
    bookingEngine: null,
  });
  return { service, usages, appointmentUsageRefs };
}

describe('B1.4 catalog removal acceptance', () => {
  it('creates an in-person doctor booking without a catalog purchase', async () => {
    const booking = await createBookingOnCanonicalEngine(bookingDeps(), {
      type: 'in_person',
      userId: PATIENT_ID,
      organizationId: ORGANIZATION_ID,
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
      cityCode: 'msk',
      slotStart: '2027-03-10T09:00:00.000Z',
      slotEnd: '2027-03-10T10:00:00.000Z',
      contactName: 'Пациент',
      contactPhone: '+79990000000',
    });

    expect(booking).toMatchObject({
      status: 'confirmed',
      canonicalAppointmentId: APPOINTMENT_ID,
      serviceTitleSnapshot: 'Приём',
    });
  });

  it('offers the existing membership through its own payment path', async () => {
    const { service } = membershipsHarness();

    const offered = await service.purchaseCatalogPackageForPatient({
      organizationId: ORGANIZATION_ID,
      platformUserId: PATIENT_ID,
      subscriptionPackageId: SUBSCRIPTION_PACKAGE_ID,
    });

    expect(offered).toMatchObject({
      id: PACKAGE_ID,
      status: 'awaiting_payment',
      paymentIntentId: 'intent-1',
      checkoutUrl: 'https://payments.example.test/intent-1',
    });
  });

  it('reserves and consumes an active membership visit through the appointment lifecycle', async () => {
    const { service, usages, appointmentUsageRefs } = membershipsHarness();
    const activated = await service.activatePatientPackage(
      PACKAGE_ID,
      ORGANIZATION_ID,
      'payment-1',
    );
    expect(activated?.status).toBe('active');

    await service.reserveForAppointment({
      organizationId: ORGANIZATION_ID,
      patientPackageId: PACKAGE_ID,
      serviceId: SERVICE_ID,
      appointmentId: APPOINTMENT_ID,
      platformUserId: PATIENT_ID,
    });
    const outcome = await service.onVisitConfirmed(APPOINTMENT_ID, ORGANIZATION_ID);
    const detail = await service.getPatientPackageDetail(PACKAGE_ID, ORGANIZATION_ID);

    expect(outcome).toEqual({ skipped: false });
    expect(usages.map((usage) => usage.usageKind)).toEqual(['reserve', 'consume', 'release']);
    expect(appointmentUsageRefs.get(APPOINTMENT_ID)).toBe('usage-2');
    expect(detail?.package.balance.items[0]).toMatchObject({
      consumed: 1,
      remaining: 1,
    });
  });
});
