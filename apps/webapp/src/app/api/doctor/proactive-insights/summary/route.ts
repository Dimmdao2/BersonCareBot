/**
 * GET /api/doctor/proactive-insights/summary — число проактивных сигналов для бейджа «Сегодня».
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';

export async function GET(_request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const displayIana = await getAppDisplayTimeZone();
  const deps = buildAppDeps();
  const { totalCount } = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.doctorProactiveInsights.queryInsights({
      limit: 1,
      displayIana,
      organizationId: gate.ctx.organizationId,
    }),
  );
  return NextResponse.json({ ok: true, count: totalCount });
}
