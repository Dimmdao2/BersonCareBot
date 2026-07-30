import { NextResponse } from 'next/server';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { routePaths } from '@/app-layer/routes/paths';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { canMaterializePatientMechanicOnRead } from '@/app-layer/entitlements/readMaterializationGate';

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const userId = gate.session.user.userId;
  const [tz, materializeMissingTracking] = await Promise.all([
    getAppDisplayTimeZone(),
    canMaterializePatientMechanicOnRead(deps, userId, 'patient_diaries'),
  ]);
  const state = await deps.patientMood.getCheckinState(userId, tz, {
    materializeMissingTracking,
  });
  return NextResponse.json({
    ok: true,
    mood: state.mood,
    lastEntry: state.lastEntry,
  });
}
