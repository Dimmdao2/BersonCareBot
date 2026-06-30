import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const upsertBody = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  specialistId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  replace: z.boolean().optional(),
});

const patchBody = upsertBody.partial().extend({
  id: z.string().uuid(),
  isActive: z.boolean().optional(),
});

export async function GET(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const url = new URL(request.url);
  const specialistId = url.searchParams.get("specialistId");
  const branchId = url.searchParams.get("branchId");
  const roomId = url.searchParams.get("roomId");
  const weekdayRaw = url.searchParams.get("weekday");
  const weekdayParsed = weekdayRaw !== null
    ? z.coerce.number().int().min(0).max(6).safeParse(weekdayRaw)
    : { success: true as const, data: undefined };
  if (!weekdayParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid weekday" }, { status: 400 });
  }
  const weekdayFilter = weekdayParsed.data;
  const [rows, usesFallback] = await Promise.all([
    deps.bookingScheduling.listWorkingHoursAdmin({
      organizationId: gate.ctx.organizationId,
      specialistId: specialistId === "__none__" ? null : specialistId || undefined,
      branchId: branchId === "__none__" ? null : branchId || undefined,
      roomId: roomId === "__none__" ? null : roomId || undefined,
      weekday: weekdayFilter,
    }),
    deps.bookingScheduling.usesWorkingHoursFallback({
      organizationId: gate.ctx.organizationId,
      specialistId: specialistId === "__none__" ? null : specialistId || undefined,
      branchId: branchId === "__none__" ? null : branchId || undefined,
      roomId: roomId === "__none__" ? null : roomId || undefined,
    }),
  ]);
  return NextResponse.json({ ok: true, rows, usesFallback });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = upsertBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.startMinute >= parsed.data.endMinute) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  try {
    const row = await deps.bookingScheduling.createWorkingHours({
      organizationId: gate.ctx.organizationId,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, row });
  } catch {
    return NextResponse.json({ ok: false, error: "create_failed" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  try {
    const row = await deps.bookingScheduling.updateWorkingHours({
      organizationId: gate.ctx.organizationId,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, row });
  } catch {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  await deps.bookingScheduling.deactivateWorkingHours(id, gate.ctx.organizationId);
  return NextResponse.json({ ok: true });
}
