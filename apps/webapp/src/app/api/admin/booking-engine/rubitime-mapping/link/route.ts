import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../../_requireAdminBookingEngine";

const LinkSchema = z.object({
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  legacyBranchId: z.string().uuid(),
  legacyServiceId: z.string().uuid(),
  legacySpecialistId: z.string().uuid(),
  rubitimeServiceId: z.string().min(1).max(120),
  isActive: z.boolean().optional(),
});

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  if (!deps.rubitimeMapping || !deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "rubitime_mapping_unavailable" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = LinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const specialists = await gate.ctx.service.catalog.listSpecialists(gate.ctx.organizationId);
  const defaultSpecialist = specialists.find((s) => s.isActive) ?? specialists[0] ?? null;
  if (!defaultSpecialist) {
    return NextResponse.json({ ok: false, error: "specialist_not_found" }, { status: 400 });
  }

  try {
    const result = await deps.rubitimeMapping.linkMapping({
      organizationId: gate.ctx.organizationId,
      branchId: parsed.data.branchId,
      serviceId: parsed.data.serviceId,
      specialistId: defaultSpecialist.id,
      legacyBranchId: parsed.data.legacyBranchId,
      legacyServiceId: parsed.data.legacyServiceId,
      legacySpecialistId: parsed.data.legacySpecialistId,
      rubitimeServiceId: parsed.data.rubitimeServiceId,
      isActive: parsed.data.isActive,
    });

    const reverseBranchServiceId = await deps.bookingScheduling.resolveLegacyBranchServiceId({
      organizationId: gate.ctx.organizationId,
      branchId: parsed.data.branchId,
      serviceId: parsed.data.serviceId,
      specialistId: defaultSpecialist.id,
    });
    if (!reverseBranchServiceId || reverseBranchServiceId !== result.branchServiceId) {
      return NextResponse.json({ ok: false, error: "link_verify_failed" }, { status: 500 });
    }

    const canonical = await deps.bookingScheduling.resolveInPersonContext(result.branchServiceId);
    if (!canonical) {
      return NextResponse.json({ ok: false, error: "link_verify_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ...result, canonical });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    const status =
      msg === "branch_not_found" ||
      msg === "service_not_found" ||
      msg === "specialist_not_found" ||
      msg === "specialist_branch_mismatch"
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
