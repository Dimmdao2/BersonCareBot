/**
 * POST /api/doctor/treatment-program-promo/refresh — пересоздать активные promo-инстансы по сохранённому шаблону
 * Guard: role doctor | admin
 */
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { canAccessDoctor } from "@/modules/roles/service";
import { refreshDefaultPromoPrograms } from "@/app-layer/treatment-program/refreshDefaultPromoPrograms";

export async function POST() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const deps = buildAppDeps();

  try {
    const result = await refreshDefaultPromoPrograms(deps, session.user.userId);
    return NextResponse.json({
      ok: true,
      templateId: result.templateId,
      refreshedCount: result.refreshedCount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
