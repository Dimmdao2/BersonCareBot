import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const PostSchema = z.object({
  fullName: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  branchId: z.string().uuid().optional(),
});

export async function GET() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const specialists = await gate.ctx.service.catalog.listSpecialists(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, specialists });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const specialist = await gate.ctx.service.catalog.upsertSpecialist({
    organizationId: gate.ctx.organizationId,
    fullName: parsed.data.fullName.trim(),
    description: parsed.data.description ?? null,
    isActive: parsed.data.isActive,
    sortOrder: parsed.data.sortOrder,
  });
  if (parsed.data.branchId) {
    await gate.ctx.service.catalog.setSpecialistLocation({
      organizationId: gate.ctx.organizationId,
      specialistId: specialist.id,
      branchId: parsed.data.branchId,
      isActive: true,
    });
  }
  return NextResponse.json({ ok: true, specialist });
}
