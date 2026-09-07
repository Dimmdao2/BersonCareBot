import { NextResponse } from 'next/server';
import { assertIntegratorGetRequest } from '@/app-layer/integrator/assertIntegratorGetRequest';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientWorkspaceModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  if (!userId || userId.trim() === '') {
    return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const moduleGate = await requirePatientWorkspaceModuleForApi(
    deps,
    userId.trim(),
    'rehabilitation',
  );
  if (!moduleGate.ok) return moduleGate.response;
  const complexes = await deps.diaries.listLfkComplexes(userId.trim(), true);
  const includeTreatmentPrograms = url.searchParams.get('includeTreatmentPrograms') === 'true';
  const treatmentProgramLfkBlocks = includeTreatmentPrograms
    ? await deps.treatmentProgramInstance.listTreatmentProgramLfkBlocksForIntegratorPatient(
        userId.trim(),
      )
    : undefined;
  return NextResponse.json({
    ok: true,
    complexes,
    ...(treatmentProgramLfkBlocks !== undefined ? { treatmentProgramLfkBlocks } : {}),
  });
}
