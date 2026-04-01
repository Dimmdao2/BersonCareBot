/**
 * GET    /api/admin/booking-catalog/branch-services/[id]
 * PATCH  /api/admin/booking-catalog/branch-services/[id] — повторный upsert по той же паре branch+service
 * DELETE /api/admin/booking-catalog/branch-services/[id] — soft deactivate
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { httpFromDatabaseError, jsonIfInvalidCatalogId } from "../../_httpErrors";
import { requireAdminBookingCatalog } from "../../_requireAdminBookingCatalog";

const PatchBranchServiceSchema = z.object({
  specialistId: z.string().uuid().optional(),
  rubitimeServiceId: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const branchService = await gate.ctx.port.getBranchServiceById(id);
  if (!branchService) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, branchService });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const body = await request.json().catch(() => null);
  const parsed = PatchBranchServiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const cur = await gate.ctx.port.getBranchServiceById(id);
  if (!cur) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  try {
    const branchService = await gate.ctx.port.upsertBranchServiceAdmin({
      branchId: cur.branchId,
      serviceId: cur.serviceId,
      specialistId: parsed.data.specialistId ?? cur.specialistId,
      rubitimeServiceId: (parsed.data.rubitimeServiceId ?? cur.rubitimeServiceId).trim(),
      isActive: parsed.data.isActive ?? cur.isActive,
      sortOrder: parsed.data.sortOrder ?? cur.sortOrder,
    });
    return NextResponse.json({ ok: true, branchService });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    if (msg === "specialist_not_found" || msg === "specialist_branch_mismatch") {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    const mapped = httpFromDatabaseError(e);
    if (mapped) {
      return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const deleted = await gate.ctx.port.deactivateBranchService(id);
  if (!deleted) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
