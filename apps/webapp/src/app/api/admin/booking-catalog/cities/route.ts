/**
 * GET  /api/admin/booking-catalog/cities — список городов (включая неактивные)
 * POST /api/admin/booking-catalog/cities — создать/обновить по code (upsert)
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBookingCatalog } from "../_requireAdminBookingCatalog";

const PostCitySchema = z.object({
  code: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/i),
  title: z.string().min(1).max(200),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET() {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const cities = await gate.ctx.port.listCitiesAdmin();
  return NextResponse.json({ ok: true, cities });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PostCitySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const city = await gate.ctx.port.upsertCity({
      code: parsed.data.code.trim().toLowerCase(),
      title: parsed.data.title.trim(),
      isActive: parsed.data.isActive,
      sortOrder: parsed.data.sortOrder,
    });
    return NextResponse.json({ ok: true, city });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
