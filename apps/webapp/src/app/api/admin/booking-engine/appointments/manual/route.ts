import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../../_requireAdminBookingEngine";

const bodySchema = z.object({
  organizationId: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  specialistId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  platformUserId: z.string().uuid().nullable().optional(),
  phoneNormalized: z.string().nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  title: z.string().optional(),
});

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const { ctx } = gate;
  const orgId = parsed.data.organizationId ?? ctx.organizationId;
  try {
    const appointment = await ctx.service.createAppointment({
      organizationId: orgId,
      branchId: parsed.data.branchId ?? null,
      roomId: parsed.data.roomId ?? null,
      specialistId: parsed.data.specialistId ?? null,
      serviceId: parsed.data.serviceId ?? null,
      platformUserId: parsed.data.platformUserId ?? null,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      durationMinutes: parsed.data.durationMinutes,
      source: "admin_manual",
      status: "confirmed",
      phoneNormalized: parsed.data.phoneNormalized ?? null,
      actorId: ctx.session.user.userId,
    });
    return NextResponse.json({ ok: true, appointment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "create_failed";
    if (message === "slot_overlap" || (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23P01")) {
      return NextResponse.json({ ok: false, error: "slot_overlap" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
