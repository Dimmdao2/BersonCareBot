import { NextResponse } from 'next/server';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { routePaths } from '@/app-layer/routes/paths';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { resolveCalendarDayIanaForPatient } from '@/modules/system-settings/calendarIana';
import { canMaterializePatientMechanicOnRead } from '@/app-layer/entitlements/readMaterializationGate';

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const userId = gate.session.user.userId;
  const [appDefault, personalIana, materializeMissingTracking] = await Promise.all([
    getAppDisplayTimeZone(),
    deps.patientCalendarTimezone.getIanaForUser(userId),
    canMaterializePatientMechanicOnRead(deps, userId, 'patient_diaries'),
  ]);
  const tz = resolveCalendarDayIanaForPatient(personalIana, appDefault);
  const sparkline = await deps.patientMood.getWeekSparkline(userId, tz, {
    materializeMissingTracking,
  });
  return NextResponse.json({ ok: true, ...sparkline });
}
