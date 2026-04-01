/**
 * GET  /api/admin/booking-catalog/specialists?branchId=
 * POST /api/admin/booking-catalog/specialists — upsert по (rubitime_cooperator_id, branch)
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBookingCatalog } from "../_requireAdminBookingCatalog";

const PostSpecialistSchema = z.object({
  rubitimeBranchId: z.string().min(1).max(120),
  fullName: z.string().min(1).max(200),
  description: z.union([z.string().max(2000), z.null()]).optional(),
  rubitimeCooperatorId: z.string().min(1).max(120),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET(request: Request) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId")?.trim();
  const specialists = await gate.ctx.port.listSpecialistsAdmin(branchId || undefined);
  return NextResponse.json({ ok: true, specialists });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PostSpecialistSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const { id } = await gate.ctx.port.upsertSpecialist({
      rubitimeBranchId: parsed.data.rubitimeBranchId.trim(),
      fullName: parsed.data.fullName.trim(),
      description: parsed.data.description ?? null,
      rubitimeCooperatorId: parsed.data.rubitimeCooperatorId.trim(),
      isActive: parsed.data.isActive,
      sortOrder: parsed.data.sortOrder,
    });
    const specialist = await gate.ctx.port.getSpecialistById(id);
    return NextResponse.json({ ok: true, specialist });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    const status = msg.startsWith("branch_not_found") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
