/**
 * GET /api/doctor/patients/[userId]/proactive-insights
 * → { ok: true, signals: ProactiveInsightRow[] }
 *
 * Proactive signals (insights) for one patient — used in the «Обзор» tab of
 * the Patient card. Delegates to DoctorProactiveInsightsPort.listForPatient.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';

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
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const displayIana = await getAppDisplayTimeZone();
  const signals = await deps.doctorProactiveInsights.listForPatient({
    patientUserId: identity.userId,
    organizationId: gate.ctx.organizationId,
    displayIana,
  });

  return NextResponse.json({ ok: true, signals });
}
