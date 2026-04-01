/**
 * GET  /api/admin/booking-catalog/branches
 * POST /api/admin/booking-catalog/branches — upsert по rubitime_branch_id
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBookingCatalog } from "../_requireAdminBookingCatalog";

const PostBranchSchema = z.object({
  cityCode: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  address: z.union([z.string().max(500), z.null()]).optional(),
  rubitimeBranchId: z.string().min(1).max(120),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET() {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const branches = await gate.ctx.port.listBranchesAdmin();
  return NextResponse.json({ ok: true, branches });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PostBranchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const { id } = await gate.ctx.port.upsertBranch({
      cityCode: parsed.data.cityCode.trim().toLowerCase(),
      title: parsed.data.title.trim(),
      address: parsed.data.address ?? null,
      rubitimeBranchId: parsed.data.rubitimeBranchId.trim(),
      isActive: parsed.data.isActive,
      sortOrder: parsed.data.sortOrder,
    });
    const branch = await gate.ctx.port.getBranchById(id);
    return NextResponse.json({ ok: true, branch });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    const status = msg.startsWith("city_not_found") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
