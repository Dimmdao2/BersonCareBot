import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/app-layer/logging/logger";

export async function GET() {
  const deps = buildAppDeps();
  if (!deps.bookingCatalog) {
    return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
  }
  try {
    const cities = await deps.bookingCatalog.listCitiesForPatient();
    return NextResponse.json({ ok: true, cities }, { status: 200 });
  } catch (err) {
    logger.error({ err }, "[booking/public/catalog/cities] failed");
    return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
  }
}
