import { NextResponse } from 'next/server';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { routePaths } from '@/app-layer/routes/paths';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const userId = gate.session.user.userId;
  const tz = await getAppDisplayTimeZone();
  // patient_diaries is a critical mechanic (#1069, owner 31.07) — always materializes.
  const state = await deps.patientMood.getCheckinState(userId, tz, {
    materializeMissingTracking: true,
  });
  return NextResponse.json({
    ok: true,
    mood: state.mood,
    lastEntry: state.lastEntry,
  });
}
