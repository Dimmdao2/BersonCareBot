/**
 * GET /api/doctor/pending-program-tests/summary — число попыток «К проверке» для бейджа «Сегодня».
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

export async function GET(_request: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const deps = buildAppDeps();
  const count = await deps.treatmentProgramProgress.countPendingTestEvaluationAttemptsGlobal(
    auth.ctx.organizationId,
  );
  return NextResponse.json({ ok: true, count });
}
