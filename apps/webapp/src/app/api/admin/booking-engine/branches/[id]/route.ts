import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBookingEngine } from "../../_requireAdminBookingEngine";

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  cityCode: z.string().min(1).max(80).optional(),
  address: z.string().max(500).nullable().optional(),
  timezone: z.string().max(80).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const existing = await gate.ctx.service.catalog.getBranch(id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const branch = await gate.ctx.service.catalog.upsertBranch({
    organizationId: existing.organizationId,
    id,
    title: parsed.data.title ?? existing.title,
    cityCode: parsed.data.cityCode ?? existing.cityCode,
    address: parsed.data.address !== undefined ? parsed.data.address : existing.address,
    timezone: parsed.data.timezone ?? existing.timezone,
    isActive: parsed.data.isActive ?? existing.isActive,
    sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
  });
  return NextResponse.json({ ok: true, branch });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const ok = await gate.ctx.service.catalog.deactivateBranch(id);
  return NextResponse.json({ ok });
}
