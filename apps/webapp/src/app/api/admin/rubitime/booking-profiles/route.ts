/**
 * GET  /api/admin/rubitime/booking-profiles — список профилей записи
 * POST /api/admin/rubitime/booking-profiles — создать/обновить профиль
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { adminListBookingProfiles, adminUpsertBookingProfile } from "@/modules/integrator/rubitimeAdminApi";

const UpsertProfileSchema = z.object({
  bookingType: z.enum(["online", "in_person"]),
  categoryCode: z.string().min(1).max(50),
  cityCode: z.string().min(1).max(50).nullable().optional(),
  branchId: z.number().int().positive(),
  serviceId: z.number().int().positive(),
  cooperatorId: z.number().int().positive(),
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
    const profiles = await adminListBookingProfiles();
    return NextResponse.json({ ok: true, profiles });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = UpsertProfileSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const result = await adminUpsertBookingProfile({ ...parsed.data, cityCode: parsed.data.cityCode ?? null });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
