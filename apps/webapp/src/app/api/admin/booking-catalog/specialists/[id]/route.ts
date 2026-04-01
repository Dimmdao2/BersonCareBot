/**
 * GET    /api/admin/booking-catalog/specialists/[id]
 * PATCH  /api/admin/booking-catalog/specialists/[id]
 * DELETE /api/admin/booking-catalog/specialists/[id] — soft deactivate
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { httpFromDatabaseError, jsonIfInvalidCatalogId } from "../../_httpErrors";
import { requireAdminBookingCatalog } from "../../_requireAdminBookingCatalog";

const PatchSpecialistSchema = z.object({
  branchId: z.string().uuid().optional(),
  fullName: z.string().min(1).max(200).optional(),
  description: z.union([z.string().max(2000), z.null()]).optional(),
  rubitimeCooperatorId: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const specialist = await gate.ctx.port.getSpecialistById(id);
  if (!specialist) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, specialist });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const body = await request.json().catch(() => null);
  const parsed = PatchSpecialistSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const specialist = await gate.ctx.port.updateSpecialistById(id, parsed.data);
    if (!specialist) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, specialist });
  } catch (e) {
    const mapped = httpFromDatabaseError(e);
    if (mapped) {
      return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
    }
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const deleted = await gate.ctx.port.deactivateSpecialist(id);
  if (!deleted) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
