/**
 * GET  /api/admin/booking-catalog/branch-services?branchId=
 * POST /api/admin/booking-catalog/branch-services — upsert связи branch+service (UNIQUE)
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBookingCatalog } from "../_requireAdminBookingCatalog";

const PostBranchServiceSchema = z.object({
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  specialistId: z.string().uuid(),
  rubitimeServiceId: z.string().min(1).max(120),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET(request: Request) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId")?.trim();
  const branchServices = await gate.ctx.port.listBranchServicesAdmin(branchId || undefined);
  return NextResponse.json({ ok: true, branchServices });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PostBranchServiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const branchService = await gate.ctx.port.upsertBranchServiceAdmin({
      branchId: parsed.data.branchId,
      serviceId: parsed.data.serviceId,
      specialistId: parsed.data.specialistId,
      rubitimeServiceId: parsed.data.rubitimeServiceId.trim(),
      isActive: parsed.data.isActive,
      sortOrder: parsed.data.sortOrder,
    });
    return NextResponse.json({ ok: true, branchService });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    const status =
      msg === "specialist_not_found" || msg === "specialist_branch_mismatch" ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
