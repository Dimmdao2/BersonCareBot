import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/infra/logging/logger";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";

const querySchema = z.object({
  cityCode: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    cityCode: url.searchParams.get("cityCode") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.bookingCatalog) {
    return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
  }
  try {
    const services = await deps.bookingCatalog.listServicesByCity(parsed.data.cityCode);
    return NextResponse.json({ ok: true, services }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "city_not_found" || msg === "city_code_required") {
      return NextResponse.json({ ok: false, error: "city_not_found" }, { status: 404 });
    }
    logger.error({ err }, "[booking/catalog/services] failed");
    return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
  }
}
