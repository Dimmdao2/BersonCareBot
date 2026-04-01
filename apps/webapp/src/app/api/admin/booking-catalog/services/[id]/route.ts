/**
 * GET    /api/admin/booking-catalog/services/[id]
 * PATCH  /api/admin/booking-catalog/services/[id]
 * DELETE /api/admin/booking-catalog/services/[id] — soft deactivate
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { httpFromDatabaseError, jsonIfInvalidCatalogId } from "../../_httpErrors";
import { requireAdminBookingCatalog } from "../../_requireAdminBookingCatalog";

const PatchServiceSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.union([z.string().max(2000), z.null()]).optional(),
  durationMinutes: z.number().int().positive().optional(),
  priceMinor: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const service = await gate.ctx.port.getServiceById(id);
  if (!service) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, service });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const body = await request.json().catch(() => null);
  const parsed = PatchServiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const service = await gate.ctx.port.updateServiceById(id, parsed.data);
    if (!service) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, service });
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
  const deleted = await gate.ctx.port.deactivateService(id);
  if (!deleted) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
