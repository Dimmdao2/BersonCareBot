import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const QuerySchema = z.object({
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
});

export async function GET(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    branchId: url.searchParams.get("branchId"),
    serviceId: url.searchParams.get("serviceId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }

  const { organizationId, service } = gate.ctx;
  const [branch, specialists] = await Promise.all([
    service.catalog.getBranch(parsed.data.branchId),
    service.catalog.listSpecialists(organizationId),
  ]);
  if (!branch || branch.organizationId !== organizationId) {
    return NextResponse.json({ ok: false, error: "branch_not_found" }, { status: 404 });
  }

  const defaultSpecialist = specialists.find((s) => s.isActive) ?? specialists[0] ?? null;
  const branchServiceId = await deps.bookingScheduling.resolveLegacyBranchServiceId({
    organizationId,
    branchId: parsed.data.branchId,
    serviceId: parsed.data.serviceId,
    specialistId: defaultSpecialist?.id ?? null,
  });
  if (!branchServiceId) {
    return NextResponse.json({ ok: false, error: "branch_service_mapping_missing" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    branchServiceId,
    cityCode: branch.cityCode,
  });
}
