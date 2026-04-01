/**
 * GET  /api/admin/rubitime/services — список услуг Rubitime
 * POST /api/admin/rubitime/services — создать/обновить услугу
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { adminListServices, adminUpsertService } from "@/modules/integrator/rubitimeAdminApi";

const UpsertServiceSchema = z.object({
  rubitimeServiceId: z.number().int().positive(),
  title: z.string().min(1).max(200),
  categoryCode: z.string().min(1).max(50),
  durationMinutes: z.number().int().positive().max(480),
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
    const services = await adminListServices();
    return NextResponse.json({ ok: true, services });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = UpsertServiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const service = await adminUpsertService(parsed.data);
    return NextResponse.json({ ok: true, service });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
