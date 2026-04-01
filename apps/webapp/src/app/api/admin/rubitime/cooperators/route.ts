/**
 * GET  /api/admin/rubitime/cooperators — список специалистов Rubitime
 * POST /api/admin/rubitime/cooperators — создать/обновить специалиста
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { adminListCooperators, adminUpsertCooperator } from "@/modules/integrator/rubitimeAdminApi";

const UpsertCooperatorSchema = z.object({
  rubitimeCooperatorId: z.number().int().positive(),
  title: z.string().min(1).max(200),
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
    const cooperators = await adminListCooperators();
    return NextResponse.json({ ok: true, cooperators });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = UpsertCooperatorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const cooperator = await adminUpsertCooperator(parsed.data);
    return NextResponse.json({ ok: true, cooperator });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
