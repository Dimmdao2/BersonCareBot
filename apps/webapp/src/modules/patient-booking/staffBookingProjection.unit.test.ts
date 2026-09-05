import { describe, expect, it } from 'vitest';
import type { BeAppointment, BeBranch, BeClinicService } from '@/modules/booking-engine/types';
import type { CreatePendingPatientBookingInput, PatientBookingsPort } from './ports';
import { createPatientBookingService } from './service';
import type { PatientBookingRecord } from './types';

function projectionRecord(
  input: CreatePendingPatientBookingInput,
  canonicalAppointmentId: string | null = null,
): PatientBookingRecord {
  return {
    id: 'booking-projection-1',
    organizationId: input.organizationId,
    userId: input.userId,
    bookingType: input.bookingType,
    city: input.city,
    category: input.category,
    slotStart: input.slotStart,
    slotEnd: input.slotEnd,
    status: canonicalAppointmentId ? 'confirmed' : 'creating',
    cancelledAt: null,
    cancelReason: null,
    gcalEventId: null,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail,
    contactName: input.contactName,
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: '2026-09-05T12:00:00.000Z',
    updatedAt: '2026-09-05T12:00:00.000Z',
    branchServiceId: input.branchServiceId,
    branchId: input.branchId,
    serviceId: input.serviceId,
    cityCodeSnapshot: input.cityCodeSnapshot,
    branchTitleSnapshot: input.branchTitleSnapshot,
    serviceTitleSnapshot: input.serviceTitleSnapshot,
    durationMinutesSnapshot: input.durationMinutesSnapshot,
    priceMinorSnapshot: input.priceMinorSnapshot,
    canonicalAppointmentId,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
  };
}

describe('staff booking payment projection', () => {
  it('captures the selected service price when a doctor creates an appointment', async () => {
    let projection: PatientBookingRecord | null = null;
    const bookingsPort = {
      getByCanonicalAppointmentId: async () => projection,
      createPending: async (input: CreatePendingPatientBookingInput) => {
        projection = projectionRecord(input);
        return projection;
      },
      markConfirmed: async (
        _bookingId: string,
        options?: { canonicalAppointmentId?: string | null },
      ) => {
        if (!projection) return null;
        projection = {
          ...projection,
          status: 'confirmed',
          canonicalAppointmentId: options?.canonicalAppointmentId ?? null,
        };
        return projection;
      },
    } as unknown as PatientBookingsPort;
    const branch: BeBranch = {
      id: 'branch-1',
      organizationId: 'org-1',
      title: 'Санкт-Петербург',
      shortTitle: 'СПб',
      color: null,
      cityCode: 'spb',
      address: null,
      timezone: 'Europe/Moscow',
      isActive: true,
      sortOrder: 0,
    };
    const service: BeClinicService = {
      id: 'service-1',
      organizationId: 'org-1',
      title: 'Сеанс 60 мин',
      description: null,
      durationMinutes: 60,
      bufferAfterMinutes: 0,
      priceMinor: 700_000,
      isActive: true,
      prepaymentApplicable: true,
      usableInPackages: true,
      onlinePaymentApplicable: true,
      publicWidgetVisible: true,
      adminManualOnly: false,
      sortOrder: 0,
    };
    const appointment: BeAppointment = {
      id: 'appointment-1',
      organizationId: 'org-1',
      branchId: branch.id,
      roomId: null,
      specialistId: 'specialist-1',
      serviceId: service.id,
      platformUserId: 'patient-1',
      startAt: '2026-09-06T09:00:00.000Z',
      endAt: '2026-09-06T10:00:00.000Z',
      durationMinutes: 60,
      source: 'admin_manual',
      status: 'confirmed',
      originalStartAt: null,
      rescheduleCount: 0,
      paymentRef: null,
      packageUsageRef: null,
      phoneNormalized: '+79990000000',
      attributionJson: {},
      appointmentReminderAllowedPresetIds: [],
      appointmentReminderPresetId: null,
      appointmentReminderSelectionSource: 'specialist_default',
    };
    const patientBooking = createPatientBookingService({
      bookingsPort,
      syncPort: { emitBookingEvent: async () => undefined },
      bookingEngine: {
        catalog: { getBranch: async () => branch },
        services: { getService: async () => service },
      } as unknown as Parameters<typeof createPatientBookingService>[0]['bookingEngine'],
      outboundMessageQueue: { enqueue: async () => true },
    });

    const result = await patientBooking.ensureStaffBookingProjection({
      appointment,
      contactName: 'Берсон Дмитрий',
      contactPhone: '+79990000000',
      contactEmail: 'patient@example.test',
    });

    expect(result).toMatchObject({
      canonicalAppointmentId: appointment.id,
      priceMinorSnapshot: 700_000,
      serviceTitleSnapshot: 'Сеанс 60 мин',
      durationMinutesSnapshot: 60,
    });
  });

  it('refreshes an unpaid appointment snapshot when the doctor changes its service', async () => {
    const oldInput: CreatePendingPatientBookingInput = {
      organizationId: 'org-1',
      userId: 'patient-1',
      bookingType: 'in_person',
      city: 'spb',
      category: 'general',
      slotStart: '2026-09-06T09:00:00.000Z',
      slotEnd: '2026-09-06T10:00:00.000Z',
      contactName: 'Берсон Дмитрий',
      contactPhone: '+79990000000',
      contactEmail: null,
      branchId: null,
      serviceId: null,
      branchServiceId: null,
      cityCodeSnapshot: 'spb',
      branchTitleSnapshot: 'Санкт-Петербург',
      serviceTitleSnapshot: 'Сеанс 40 мин',
      durationMinutesSnapshot: 40,
      priceMinorSnapshot: 400_000,
    };
    let projection = projectionRecord(oldInput, 'appointment-1');
    const bookingsPort = {
      getByCanonicalAppointmentId: async () => projection,
      updateStaffProjection: async (
        input: Parameters<PatientBookingsPort['updateStaffProjection']>[0],
      ) => {
        projection = {
          ...projection,
          slotStart: input.slotStart,
          slotEnd: input.slotEnd,
          city: input.city,
          cityCodeSnapshot: input.cityCodeSnapshot,
          branchTitleSnapshot: input.branchTitleSnapshot,
          serviceTitleSnapshot: input.serviceTitleSnapshot,
          durationMinutesSnapshot: input.durationMinutesSnapshot,
          priceMinorSnapshot: input.priceMinorSnapshot ?? projection.priceMinorSnapshot,
        };
        return projection;
      },
    } as unknown as PatientBookingsPort;
    const patientBooking = createPatientBookingService({
      bookingsPort,
      syncPort: { emitBookingEvent: async () => undefined },
      bookingEngine: {
        catalog: {
          getBranch: async () => ({
            id: 'branch-1',
            organizationId: 'org-1',
            title: 'Санкт-Петербург',
            cityCode: 'spb',
          }),
        },
        services: {
          getService: async () => ({
            id: 'service-90',
            organizationId: 'org-1',
            title: 'Сеанс 90 мин',
            priceMinor: 1_000_000,
          }),
        },
      } as unknown as Parameters<typeof createPatientBookingService>[0]['bookingEngine'],
      outboundMessageQueue: { enqueue: async () => true },
    });
    const appointment = {
      id: 'appointment-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      serviceId: 'service-90',
      platformUserId: 'patient-1',
      startAt: '2026-09-07T12:00:00.000Z',
      endAt: '2026-09-07T13:30:00.000Z',
      durationMinutes: 90,
      paymentRef: null,
    } as unknown as BeAppointment;

    const result = await patientBooking.ensureStaffBookingProjection({
      appointment,
      contactName: 'Берсон Дмитрий',
      contactPhone: '+79990000000',
    });

    expect(result).toMatchObject({
      priceMinorSnapshot: 1_000_000,
      serviceTitleSnapshot: 'Сеанс 90 мин',
      durationMinutesSnapshot: 90,
      slotStart: '2026-09-07T12:00:00.000Z',
    });
  });
});
