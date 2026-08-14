/**
 * GET /api/doctor/patients/[userId]/program-activity
 *   → { ok, activity: DoctorPatientProgramActivity }
 *
 * Виджет «Программа и комментарии» на вкладке «Обзор» карточки пациента:
 * последняя отметка пациента по программе + число упражнений с непрочитанными отметками.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { loadDoctorPatientProgramActivity } from '@/app/app/doctor/patients/loadDoctorPatientProgramActivity';

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
  const activity = await loadDoctorPatientProgramActivity(
    { programItemDiscussion: deps.programItemDiscussion },
    {
      patientUserId: identity.userId,
      viewerUserId: gate.ctx.session.user.userId,
      organizationId: gate.ctx.organizationId,
    },
  );

  return NextResponse.json({ ok: true, activity });
}
