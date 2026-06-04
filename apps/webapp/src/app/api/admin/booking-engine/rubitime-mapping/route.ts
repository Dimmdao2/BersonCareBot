import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

export async function GET(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  if (!deps.rubitimeMapping) {
    return NextResponse.json({ ok: false, error: "rubitime_mapping_unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  const problemsOnly = url.searchParams.get("problemsOnly") === "true";
  const branchId = url.searchParams.get("branchId")?.trim() || undefined;
  const serviceId = url.searchParams.get("serviceId")?.trim() || undefined;

  const summary = await deps.rubitimeMapping.listMappings({
    organizationId: gate.ctx.organizationId,
    problemsOnly,
    branchId,
    serviceId,
  });

  return NextResponse.json({ ok: true, ...summary });
}
