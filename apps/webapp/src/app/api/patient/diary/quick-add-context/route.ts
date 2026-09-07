/**
 * GET /api/patient/diary/quick-add-context — списки трекингов и комплексов для FAB вне страницы дневника.
 */
import { NextResponse } from 'next/server';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { routePaths } from '@/app-layer/routes/paths';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { resolveOrganizationWorkspaceModules } from '@/app-layer/guards/workspaceModuleAccess';

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.diary });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const deps = buildAppDeps();
  const userId = session.user.userId;
  const organizationId = getCurrentDbPrincipalOrganizationId();
  const rehabilitationEnabled = organizationId
    ? await resolveOrganizationWorkspaceModules(deps, organizationId).then(
        (modules) => modules.rehabilitation,
      )
    : false;
  const [trackings, complexes] = await Promise.all([
    deps.diaries.listSymptomTrackings(userId),
    rehabilitationEnabled ? deps.diaries.listLfkComplexes(userId) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    ok: true,
    trackings: trackings.map((t) => ({ id: t.id, title: t.symptomTitle ?? '—' })),
    complexes: complexes.map((c) => ({ id: c.id, title: c.title ?? '—' })),
  });
}
