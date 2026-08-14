import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

/** Пагинированный список прошедших записей (архив) для ленивой подгрузки. */
export async function GET(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');
  if (view !== 'past') {
    return NextResponse.json({ ok: false, error: 'invalid_view' }, { status: 400 });
  }

  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));

  const deps = buildAppDeps();
  const appointments = await deps.doctorAppointments.listAppointmentsForSpecialist(
    {
      kind: 'past',
      limit,
      offset,
    },
    {
      organizationId: gate.ctx.organizationId,
      visibilityActor: gate.ctx,
    },
  );

  return NextResponse.json({ ok: true, appointments });
}
