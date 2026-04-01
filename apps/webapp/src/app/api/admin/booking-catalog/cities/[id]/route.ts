/**
 * GET    /api/admin/booking-catalog/cities/[id]
 * PATCH  /api/admin/booking-catalog/cities/[id]
 * DELETE /api/admin/booking-catalog/cities/[id] — soft deactivate
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonIfInvalidCatalogId } from "../../_httpErrors";
import { requireAdminBookingCatalog } from "../../_requireAdminBookingCatalog";

const PatchCitySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const city = await gate.ctx.port.getCityById(id);
  if (!city) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, city });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const body = await request.json().catch(() => null);
  const parsed = PatchCitySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const city = await gate.ctx.port.updateCityById(id, parsed.data);
  if (!city) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, city });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const deleted = await gate.ctx.port.deactivateCity(id);
  if (!deleted) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
