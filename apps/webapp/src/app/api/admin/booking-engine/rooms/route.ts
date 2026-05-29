import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const PostSchema = z.object({
  branchId: z.string().uuid(),
  title: z.string().min(1).max(200),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const branchId = new URL(request.url).searchParams.get("branchId") ?? undefined;
  const rooms = await gate.ctx.service.catalog.listRooms(gate.ctx.organizationId, branchId ?? undefined);
  return NextResponse.json({ ok: true, rooms });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const room = await gate.ctx.service.catalog.upsertRoom({
    organizationId: gate.ctx.organizationId,
    branchId: parsed.data.branchId,
    title: parsed.data.title.trim(),
    isActive: parsed.data.isActive,
    sortOrder: parsed.data.sortOrder,
  });
  return NextResponse.json({ ok: true, room });
}
