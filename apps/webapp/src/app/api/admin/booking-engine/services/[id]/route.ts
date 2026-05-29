import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonIfInvalidUuid } from "../../_uuid";
import { requireAdminBookingEngine } from "../../_requireAdminBookingEngine";

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.union([z.string().max(2000), z.null()]).optional(),
  durationMinutes: z.number().int().min(1).max(24 * 60).optional(),
  priceMinor: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  prepaymentApplicable: z.boolean().optional(),
  usableInPackages: z.boolean().optional(),
  onlinePaymentApplicable: z.boolean().optional(),
  publicWidgetVisible: z.boolean().optional(),
  adminManualOnly: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const bad = jsonIfInvalidUuid(id);
  if (bad) return bad;
  const existing = await gate.ctx.service.services.getService(id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const service = await gate.ctx.service.services.upsertService({
    organizationId: existing.organizationId,
    id,
    title: parsed.data.title ?? existing.title,
    description:
      parsed.data.description !== undefined ? parsed.data.description : existing.description,
    durationMinutes: parsed.data.durationMinutes ?? existing.durationMinutes,
    priceMinor: parsed.data.priceMinor ?? existing.priceMinor,
    isActive: parsed.data.isActive ?? existing.isActive,
    prepaymentApplicable: parsed.data.prepaymentApplicable ?? existing.prepaymentApplicable,
    usableInPackages: parsed.data.usableInPackages ?? existing.usableInPackages,
    onlinePaymentApplicable:
      parsed.data.onlinePaymentApplicable ?? existing.onlinePaymentApplicable,
    publicWidgetVisible: parsed.data.publicWidgetVisible ?? existing.publicWidgetVisible,
    adminManualOnly: parsed.data.adminManualOnly ?? existing.adminManualOnly,
    sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
  });
  return NextResponse.json({ ok: true, service });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const bad = jsonIfInvalidUuid(id);
  if (bad) return bad;
  const ok = await gate.ctx.service.services.deactivateService(id);
  return NextResponse.json({ ok });
}
