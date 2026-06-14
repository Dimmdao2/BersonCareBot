/**
 * GET /api/doctor/patients/[userId]/proactive-insights
 * → { ok: true, signals: ProactiveInsightRow[] }
 *
 * Proactive signals (insights) for one patient — used in the «Обзор» tab of
 * the Patient card. Delegates to DoctorProactiveInsightsPort.listForPatient.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  const displayIana = await getAppDisplayTimeZone();
  const deps = buildAppDeps();
  const signals = await deps.doctorProactiveInsights.listForPatient({
    patientUserId: userId,
    displayIana,
  });

  return NextResponse.json({ ok: true, signals });
}
