import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const PostSchema = z.object({
  specialistId: z.string().uuid(),
  roomId: z.string().uuid(),
  isActive: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  await gate.ctx.service.catalog.setSpecialistRoom({
    organizationId: gate.ctx.organizationId,
    specialistId: parsed.data.specialistId,
    roomId: parsed.data.roomId,
    isActive: parsed.data.isActive,
  });
  const links = await gate.ctx.service.catalog.listSpecialistRooms(gate.ctx.organizationId);
  const link = links.find(
    (l) => l.specialistId === parsed.data.specialistId && l.roomId === parsed.data.roomId,
  );
  return NextResponse.json({ ok: true, specialistRoom: link ?? null });
}
