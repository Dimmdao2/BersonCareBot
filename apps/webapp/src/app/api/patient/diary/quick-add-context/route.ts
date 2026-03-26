/**
 * GET /api/patient/diary/quick-add-context — списки трекингов и комплексов для FAB вне страницы дневника.
 */
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const deps = buildAppDeps();
  const userId = session.user.userId;
  const [trackings, complexes] = await Promise.all([
    deps.diaries.listSymptomTrackings(userId),
    deps.diaries.listLfkComplexes(userId),
  ]);

  return NextResponse.json({
    ok: true,
    trackings: trackings.map((t) => ({ id: t.id, title: t.symptomTitle ?? "—" })),
    complexes: complexes.map((c) => ({ id: c.id, title: c.title ?? "—" })),
  });
}
