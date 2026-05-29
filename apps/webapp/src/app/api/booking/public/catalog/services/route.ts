import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/app-layer/logging/logger";

const querySchema = z.object({
  cityCode: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ cityCode: url.searchParams.get("cityCode") ?? "" });
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
    logger.error({ err }, "[booking/public/catalog/services] failed");
    return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
  }
}
