/**
 * POST /api/admin/appointment-records/:integratorRecordId/soft-delete — пометить запись удалённой (admin only).
 * Пишет `appointment_records.deleted_at` и при совпадении `patient_bookings.rubitime_id` отменяет активные статусы
 * (чтобы запись ушла из кабинета пациента).
 */
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";

function bookingPayloadFromRow(row: PatientBookingRecord) {
  return {
    bookingId: row.id,
    userId: row.userId as string,
    rubitimeId: row.rubitimeId,
    bookingType: row.bookingType,
    city: row.city ?? undefined,
    category: row.category,
    slotStart: row.slotStart,
    slotEnd: row.slotEnd,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail ?? undefined,
    branchServiceId: row.branchServiceId,
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
  if (integratorRecordId.startsWith("be:")) {
    const canonicalId = integratorRecordId.slice(3).trim();
    if (!canonicalId) return null;
    return deps.patientBooking.getBookingByCanonicalAppointment(canonicalId);
  }
  return deps.patientBooking.getByRubitimeId(integratorRecordId);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ integratorRecordId: string }> }
) {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { integratorRecordId } = await context.params;
  const id = integratorRecordId?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const ok = await deps.appointmentProjection.softDeleteByIntegratorId(id);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const bookingRow = await resolveBookingForIntegratorRecordId(id, deps);
  const recordRow = deps.appointmentProjection
    ? await deps.appointmentProjection.getRecordByIntegratorId(id)
    : null;
  const slotIso = recordRow?.recordAt ?? new Date().toISOString();
  try {
    const syncPort = createBookingSyncPort();
    if (bookingRow) {
      await syncPort.emitBookingEvent({
        eventType: "booking.deleted",
        idempotencyKey: `booking.deleted:${id}`,
        payload: bookingPayloadFromRow(bookingRow),
      });
    } else {
      const canonicalId = id.startsWith("be:") ? id.slice(3).trim() : null;
      await syncPort.emitBookingEvent({
        eventType: "booking.deleted",
        idempotencyKey: `booking.deleted:${id}`,
        payload: {
          bookingId: canonicalId ?? "00000000-0000-4000-8000-000000000001",
          userId: canonicalId ?? "00000000-0000-4000-8000-000000000001",
          rubitimeId: id.startsWith("be:") ? null : id,
          bookingType: "in_person",
          category: "general",
          slotStart: slotIso,
          slotEnd: slotIso,
          contactName: "—",
          contactPhone: "+70000000000",
          ...(canonicalId ? { canonicalAppointmentId: canonicalId } : {}),
        },
      });
    }
  } catch {
    // GCal delete is best-effort after local soft-delete.
  }

  return NextResponse.json({ ok: true });
}
