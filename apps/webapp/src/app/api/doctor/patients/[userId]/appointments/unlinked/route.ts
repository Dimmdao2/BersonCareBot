/**
 * GET /api/doctor/patients/[userId]/appointments/unlinked
 *
 * Returns the patient's appointment_records that do NOT yet have a linked
 * clinical visit (clinical_visit.appointment_record_id IS NULL for this record).
 *
 * Used in the «Создать из записи» flow in NewVisitPanel.
 *
 * Response: { appointments: PatientAppointmentItem[] }
 * Each item includes `internalId` (appointment_records.id uuid) needed to set
 * appointmentRecordId when creating the visit.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const all = await deps.doctorClientsPort.listPatientAppointments(userId);

  // Filter: keep only appointments not yet linked to a clinical visit.
  // listPatientAppointments now returns internalId (appointment_records.id uuid).
  // We do this filter client-side here (no extra DB query) since the list is small
  // and the NOT EXISTS join would complicate the shared repo method.
  // To avoid stale "unlinked" data we cross-reference via the visits port:
  // fetch linked appointment IDs from clinical visits.
  const linkedIds = await deps.patientClinical.listLinkedAppointmentRecordIds(userId);
  const linkedSet = new Set(linkedIds);

  const unlinked = all.filter(
    (a) =>
      a.status !== "canceled" &&
      a.internalId != null &&
      !linkedSet.has(a.internalId),
  );

  return NextResponse.json({ ok: true, appointments: unlinked });
}
