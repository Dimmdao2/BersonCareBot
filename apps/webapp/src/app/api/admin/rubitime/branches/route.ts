/**
 * GET  /api/admin/rubitime/branches — список филиалов Rubitime
 * POST /api/admin/rubitime/branches — создать/обновить филиал
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { adminListBranches, adminUpsertBranch } from "@/modules/integrator/rubitimeAdminApi";

const UpsertBranchSchema = z.object({
  rubitimeBranchId: z.number().int().positive(),
  cityCode: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
});

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (session.user.role !== "admin" || !session.adminMode) return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const branches = await adminListBranches();
    return NextResponse.json({ ok: true, branches });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = UpsertBranchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const branch = await adminUpsertBranch(parsed.data);
    return NextResponse.json({ ok: true, branch });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
