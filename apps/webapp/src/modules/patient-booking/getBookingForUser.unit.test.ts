import { describe, expect, it, vi } from 'vitest';
import { createPatientBookingService } from './service';
import type { PatientBookingRecord } from './types';

/**
 * `getBookingForUser` is the one new service method added for the booking-success screen
 * (`app/patient/booking/done`) to resolve `canonicalInPersonContext.timezone` for
 * PATIENT-OVERVIEW-08/09/10 without trusting the `locationLabel`/`cityCode` URL query params. What
 * breaks without this test: a regression that swaps the owner-scoped `getByIdForUser` port call for
 * the unscoped `getById` would let the done screen (and any future caller) read another patient's
 * booking by id — same class of bug this port pair exists to prevent elsewhere in this service.
 */
function fakeRecord(overrides: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: 'booking-1',
    organizationId: 'org-1',
    userId: 'user-1',
    bookingType: 'in_person',
    city: null,
    category: 'general',
    slotStart: '2027-03-10T09:00:00.000Z',
    slotEnd: '2027-03-10T09:30:00.000Z',
    status: 'confirmed',
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
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: 60,
    priceMinorSnapshot: null,
    canonicalAppointmentId: 'appt-1',
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    canonicalInPersonContext: {
      branchId: 'branch-1',
      serviceId: 'service-1',
      cityCode: 'msk',
      branchTitle: 'Филиал на Тверской',
      serviceTitle: 'Консультация',
      durationMinutes: 30,
      priceMinor: 500000,
      timezone: 'Asia/Yekaterinburg',
    },
    ...overrides,
  };
}

describe('createPatientBookingService().getBookingForUser', () => {
  it('returns the full record (including canonicalInPersonContext.timezone) for the owning user', async () => {
    const record = fakeRecord();
    const getByIdForUser = vi.fn(async () => record);
    const service = createPatientBookingService({
      bookingsPort: { getByIdForUser } as never,
    } as never);

    const result = await service.getBookingForUser('booking-1', 'user-1');

    expect(result?.canonicalInPersonContext?.timezone).toBe('Asia/Yekaterinburg');
  });

  it('scopes the read through getByIdForUser(bookingId, userId) — never the unscoped getById', async () => {
    const getByIdForUser = vi.fn(async () => fakeRecord());
    const getById = vi.fn(async () => fakeRecord());
    const service = createPatientBookingService({
      bookingsPort: { getByIdForUser, getById } as never,
    } as never);

    await service.getBookingForUser('booking-1', 'user-1');

    expect(getByIdForUser).toHaveBeenCalledWith('booking-1', 'user-1');
    expect(getById).not.toHaveBeenCalled();
  });

  it('returns null for a booking that does not belong to the requesting user', async () => {
    const getByIdForUser = vi.fn(async () => null);
    const service = createPatientBookingService({
      bookingsPort: { getByIdForUser } as never,
    } as never);

    const result = await service.getBookingForUser('booking-1', 'someone-elses-user-id');

    expect(result).toBeNull();
  });
});
