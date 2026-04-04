/**
 * GET    /api/admin/booking-catalog/branches/[id]
 * PATCH  /api/admin/booking-catalog/branches/[id]
 * DELETE /api/admin/booking-catalog/branches/[id] — soft deactivate
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeAdminBranchTimezoneForPatch } from "../../_branchTimezone";
import { httpFromDatabaseError, jsonIfInvalidCatalogId } from "../../_httpErrors";
import { requireAdminBookingCatalog } from "../../_requireAdminBookingCatalog";

const PatchBranchSchema = z.object({
  cityId: z.string().uuid().optional(),
  title: z.string().min(1).max(200).optional(),
  address: z.union([z.string().max(500), z.null()]).optional(),
  rubitimeBranchId: z.string().min(1).max(120).optional(),
  timezone: z.string().max(120).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const branch = await gate.ctx.port.getBranchById(id);
  if (!branch) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, branch });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const bad = jsonIfInvalidCatalogId(id);
  if (bad) return bad;
  const body = await request.json().catch(() => null);
  const parsed = PatchBranchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  let patch = parsed.data;
  if (parsed.data.timezone !== undefined) {
    try {
      patch = { ...parsed.data, timezone: normalizeAdminBranchTimezoneForPatch(parsed.data.timezone) };
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_timezone" }, { status: 400 });
    }
  }
  try {
    const branch = await gate.ctx.port.updateBranchById(id, patch);
    if (!branch) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, branch });
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
  const deleted = await gate.ctx.port.deactivateBranch(id);
  if (!deleted) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
