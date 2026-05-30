import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const createBody = z.object({
  specialistId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  blockType: z.enum(["block", "absence"]),
  title: z.string().optional(),
});

export async function GET(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const url = new URL(request.url);
  const rangeStart = url.searchParams.get("rangeStart") ?? undefined;
  const rangeEnd = url.searchParams.get("rangeEnd") ?? undefined;
  const blocks = await deps.bookingScheduling.listScheduleBlocks({
    organizationId: gate.ctx.organizationId,
    rangeStart,
    rangeEnd,
    specialistId: url.searchParams.get("specialistId") || undefined,
    branchId: url.searchParams.get("branchId") || undefined,
    roomId: url.searchParams.get("roomId") || undefined,
  });
  return NextResponse.json({ ok: true, blocks });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = createBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const block = await deps.bookingScheduling.createScheduleBlock({
    organizationId: gate.ctx.organizationId,
    ...parsed.data,
    createdByActorId: gate.ctx.session.user.userId,
  });
  return NextResponse.json({ ok: true, block });
}

export async function DELETE(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  await deps.bookingScheduling.deleteScheduleBlock(id, gate.ctx.organizationId);
  return NextResponse.json({ ok: true });
}
