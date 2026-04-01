/**
 * DELETE /api/admin/rubitime/booking-profiles/[id] — деактивировать профиль записи
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";
import { adminDeactivateBookingProfile } from "@/modules/integrator/rubitimeAdminApi";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session) return null;
  if (session.user.role !== "admin" || !session.adminMode) return null;
  return session;
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const { id } = await context.params;
  const numId = parseInt(id, 10);
  if (!Number.isFinite(numId) || numId <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  try {
    await adminDeactivateBookingProfile(numId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
