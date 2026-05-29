import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonIfInvalidUuid } from "../../_uuid";
import { requireAdminBookingEngine } from "../../_requireAdminBookingEngine";

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const bad = jsonIfInvalidUuid(id);
  if (bad) return bad;
  const existing = await gate.ctx.service.catalog.getRoom(id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const room = await gate.ctx.service.catalog.upsertRoom({
    organizationId: existing.organizationId,
    branchId: existing.branchId,
    id,
    title: parsed.data.title ?? existing.title,
    isActive: parsed.data.isActive ?? existing.isActive,
    sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
  });
  return NextResponse.json({ ok: true, room });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const bad = jsonIfInvalidUuid(id);
  if (bad) return bad;
  const ok = await gate.ctx.service.catalog.deactivateRoom(id);
  return NextResponse.json({ ok });
}
