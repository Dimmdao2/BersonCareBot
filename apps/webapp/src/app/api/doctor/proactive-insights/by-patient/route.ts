/**
 * GET /api/doctor/proactive-insights/by-patient — active proactive signals grouped by patient.
 *
 * Owner punch-list (2026-07-25) item 2: the standalone «Сигналы пациентов» card on «Сегодня»
 * was removed (owner found it unclear), but the underlying signal mechanism
 * (doctor-proactive-insights: wellbeing_low_streak, program_inactivity) is kept — it now
 * surfaces as an «внимание» attention mark + reason tooltip on the patient's row in the
 * support/messages list (DoctorSupportInbox.tsx) instead of its own section.
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { DOCTOR_TODAY_PROACTIVE_INSIGHTS_PREVIEW_LIMIT } from '@/modules/doctor-proactive-insights/constants';

export async function GET(_request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const displayIana = await getAppDisplayTimeZone();
  const deps = buildAppDeps();
  // queryInsights internally caps at DOCTOR_TODAY_PROACTIVE_INSIGHTS_PREVIEW_LIMIT regardless of
  // the requested limit — same ceiling the "Сегодня" preview already lived with.
  const { items } = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.doctorProactiveInsights.queryInsights({
      limit: DOCTOR_TODAY_PROACTIVE_INSIGHTS_PREVIEW_LIMIT,
      displayIana,
      organizationId: gate.ctx.organizationId,
    }),
  );

  return NextResponse.json({
    ok: true,
    items: items.map((insight) => ({
      patientUserId: insight.patientUserId,
      kind: insight.kind,
      summary: insight.summary,
    })),
  });
}
