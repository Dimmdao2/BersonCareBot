import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/infra/logging/logger";
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
  if (!deps.bookingCatalog) {
    return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
  }
  try {
    const cities = await deps.bookingCatalog.listCitiesForPatient();
    return NextResponse.json({ ok: true, cities }, { status: 200 });
  } catch (err) {
    logger.error({ err }, "[booking/catalog/cities] failed");
    return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
  }
}
