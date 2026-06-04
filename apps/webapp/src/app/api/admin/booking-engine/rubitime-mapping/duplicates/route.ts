import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../../_requireAdminBookingEngine";

const ResolveSchema = z.object({
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  specialistId: z.string().uuid(),
  keepSsaId: z.string().uuid(),
  transferMappingToKeep: z.boolean().optional(),
});

export async function GET() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  if (!deps.rubitimeMapping) {
    return NextResponse.json({ ok: false, error: "rubitime_mapping_unavailable" }, { status: 503 });
  }

  const summary = await deps.rubitimeMapping.listSsaDuplicates({
    organizationId: gate.ctx.organizationId,
  });

  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  if (!deps.rubitimeMapping) {
    return NextResponse.json({ ok: false, error: "rubitime_mapping_unavailable" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ResolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  try {
    const result = await deps.rubitimeMapping.resolveSsaDuplicate({
      organizationId: gate.ctx.organizationId,
      branchId: parsed.data.branchId,
      serviceId: parsed.data.serviceId,
      specialistId: parsed.data.specialistId,
      keepSsaId: parsed.data.keepSsaId,
      transferMappingToKeep: parsed.data.transferMappingToKeep,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    const status = msg === "ssa_not_found" || msg === "keep_ssa_not_found" ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
