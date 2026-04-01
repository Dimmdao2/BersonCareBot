/**
 * GET  /api/admin/booking-catalog/services
 * POST /api/admin/booking-catalog/services — upsert по (title, duration_minutes)
 * Guard: role=admin + adminMode
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBookingCatalog } from "../_requireAdminBookingCatalog";

const PostServiceSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.union([z.string().max(2000), z.null()]).optional(),
  durationMinutes: z.number().int().positive(),
  priceMinor: z.number().int().nonnegative(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET() {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const services = await gate.ctx.port.listServicesAdmin();
  return NextResponse.json({ ok: true, services });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingCatalog();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PostServiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const { id } = await gate.ctx.port.upsertService({
      title: parsed.data.title.trim(),
      description: parsed.data.description ?? null,
      durationMinutes: parsed.data.durationMinutes,
      priceMinor: parsed.data.priceMinor,
      isActive: parsed.data.isActive,
      sortOrder: parsed.data.sortOrder,
    });
    const service = await gate.ctx.port.getServiceById(id);
    return NextResponse.json({ ok: true, service });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
