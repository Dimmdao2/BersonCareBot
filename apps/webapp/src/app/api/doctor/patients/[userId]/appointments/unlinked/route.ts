/**
 * GET /api/doctor/patients/[userId]/appointments/unlinked
 *
 * Returns the patient's canonical appointments that do NOT yet have a linked
 * clinical visit (clinical_visit.canonical_appointment_id IS NULL for this record).
 *
 * Used in the «Создать из записи» flow in NewVisitPanel.
 *
 * Response: { appointments: PatientAppointmentItem[] }
 * Each item includes `internalId` (canonical appointment uuid) needed to set the
 * visit appointment link.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const all = await deps.doctorClientsPort.listPatientAppointments(
    identity.userId,
    gate.ctx.organizationId,
  );

  // Filter: keep only appointments not yet linked to a clinical visit.
  // listPatientAppointments returns internalId (canonical appointment uuid).
  // We do this filter client-side here (no extra DB query) since the list is small
  // and the NOT EXISTS join would complicate the shared repo method.
  // To avoid stale "unlinked" data we cross-reference via the visits port:
  // fetch linked appointment IDs from clinical visits.
  const linkedIds = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.patientClinical.listLinkedAppointmentIds(identity.userId),
  );
  const linkedSet = new Set(linkedIds);

  const unlinked = all.filter(
    (a) => a.status !== 'canceled' && a.internalId != null && !linkedSet.has(a.internalId),
  );

  return NextResponse.json({ ok: true, appointments: unlinked });
}
