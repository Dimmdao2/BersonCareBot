/**
 * GET /api/doctor/pending-program-tests/summary — число попыток «К проверке» для бейджа «Сегодня».
 */
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

export async function GET(_request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const deps = buildAppDeps();
  const count = await deps.treatmentProgramProgress.countPendingTestEvaluationAttemptsGlobal();
  return NextResponse.json({ ok: true, count });
}
