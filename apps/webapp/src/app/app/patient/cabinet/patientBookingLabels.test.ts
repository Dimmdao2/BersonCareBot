import { describe, expect, it } from 'vitest';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import {
  bookingProvenancePrefix,
  nativeBookingSubtitle,
  SCHEDULE_RECORD_PROVENANCE_PREFIX,
} from './patientBookingLabels';

function baseRow(over: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: 'b1',
    userId: 'u1',
    bookingType: 'in_person',
    city: null,
    category: 'general',
    slotStart: '2026-05-01T10:00:00.000Z',
    slotEnd: '2026-05-01T11:00:00.000Z',
    status: 'confirmed',
    cancelledAt: null,
    cancelReason: null,
    gcalEventId: null,
    contactPhone: '+7000',
    contactEmail: null,
    contactName: 'T',
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    branchServiceId: null,
    branchId: null,
    serviceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: null,
    priceMinorSnapshot: null,
    canonicalAppointmentId: null,
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    ...over,
  };
}

describe('bookingProvenancePrefix', () => {
  it('returns empty for canonical bookings', () => {
    expect(bookingProvenancePrefix(baseRow())).toBe('');
  });

  it('re-exports shared schedule prefix for doctor/projection UIs', () => {
    expect(SCHEDULE_RECORD_PROVENANCE_PREFIX).toBe('Из расписания · ');
  });

  it('uses service metadata from the canonical appointment context', () => {
    expect(
      nativeBookingSubtitle(
        baseRow({
          branchServiceId: 'legacy-branch-service',
          serviceTitleSnapshot: 'Устаревшая услуга',
          canonicalInPersonContext: {
            branchId: 'canonical-branch',
            serviceId: 'canonical-service',
            cityCode: 'spb',
            branchTitle: 'Клиника',
            serviceTitle: 'Каноническая услуга',
            durationMinutes: 45,
            priceMinor: 250000,
          },
        }),
      ),
    ).toBe('Очный приём — СПб · Каноническая услуга');
  });

  it('does not present a legacy service snapshot as canonical metadata', () => {
    expect(
      nativeBookingSubtitle(
        baseRow({
          branchServiceId: 'legacy-branch-service',
          serviceTitleSnapshot: 'Устаревшая услуга',
          cityCodeSnapshot: 'moscow',
        }),
      ),
    ).toBe('Очный приём');
  });
});
