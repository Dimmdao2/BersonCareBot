/**
 * GET /api/doctor/patients/[userId]/appointments — история записей пациента.
 *
 * Response: { appointments: PatientAppointmentItem[] }
 *
 * Возвращает прошедшие + предстоящие записи пациента, новые сверху.
 * Статус: completed / rescheduled / canceled / upcoming.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
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
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const appointments = await deps.doctorClientsPort.listPatientAppointments(
    identity.userId,
    gate.ctx.organizationId,
  );

  return NextResponse.json({ appointments });
}
