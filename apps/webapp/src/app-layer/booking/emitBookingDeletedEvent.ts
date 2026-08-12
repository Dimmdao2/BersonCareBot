import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';

function bookingPayloadFromRow(row: PatientBookingRecord) {
  return {
    bookingId: row.id,
    userId: row.userId as string,
    bookingType: row.bookingType,
    city: row.city ?? undefined,
    category: row.category,
    slotStart: row.slotStart,
    slotEnd: row.slotEnd,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail ?? undefined,
    cityCodeSnapshot: row.cityCodeSnapshot,
    serviceTitleSnapshot: row.serviceTitleSnapshot,
    canonicalAppointmentId: row.canonicalAppointmentId ?? undefined,
  };
}

async function resolveBookingForIntegratorRecordId(
  integratorRecordId: string,
  deps: ReturnType<typeof buildAppDeps>,
): Promise<PatientBookingRecord | null> {
  if (!deps.patientBooking) return null;
  if (!integratorRecordId.startsWith('be:')) return null;
  const canonicalId = integratorRecordId.slice(3).trim();
  if (!canonicalId) return null;
  return deps.patientBooking.getBookingByCanonicalAppointment(canonicalId);
}

export async function emitBookingDeletedEvent(input: {
  deps: ReturnType<typeof buildAppDeps>;
  integratorRecordId: string;
  /** Staff canonical delete — idempotency `booking.deleted:staff:{appointmentId}` */
  idempotencySuffix?: string;
  slotIsoFallback?: string;
}): Promise<void> {
  const id = input.integratorRecordId.trim();
  if (!id) return;

  const bookingRow = await resolveBookingForIntegratorRecordId(id, input.deps);
  const recordRow = input.deps.appointmentAccess
    ? await input.deps.appointmentAccess.getByExternalRecordId(id)
    : null;
  const slotIso = recordRow?.recordAt ?? input.slotIsoFallback ?? new Date().toISOString();
  const idempotencyKey = input.idempotencySuffix
    ? `booking.deleted:staff:${input.idempotencySuffix}`
    : `booking.deleted:${id}`;

  const syncPort = createBookingSyncPort();
  if (bookingRow) {
    await syncPort.emitBookingEvent({
      eventType: 'booking.deleted',
      idempotencyKey,
      payload: bookingPayloadFromRow(bookingRow),
    });
    return;
  }

  const canonicalId = id.startsWith('be:') ? id.slice(3).trim() : null;
  await syncPort.emitBookingEvent({
    eventType: 'booking.deleted',
    idempotencyKey,
    payload: {
      bookingId: canonicalId ?? '00000000-0000-4000-8000-000000000001',
      userId: canonicalId ?? '00000000-0000-4000-8000-000000000001',
      bookingType: 'in_person',
      category: 'general',
      slotStart: slotIso,
      slotEnd: slotIso,
      contactName: '—',
      contactPhone: '+70000000000',
      ...(canonicalId ? { canonicalAppointmentId: canonicalId } : {}),
    },
  });
}
