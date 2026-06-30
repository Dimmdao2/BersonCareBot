import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorBookingEngine } from "../_requireDoctorBookingEngine";
import { resolveDoctorOwnSpecialistId } from "../_resolveDoctorSpecialistId";

// Doctor-self-scoped mirror of /api/admin/booking-engine/working-hours.
// The doctor owns ONLY their own specialist's weekly schedule. The server resolves
// that specialist and FORCES it on every read/write — a client-supplied specialistId
// is never trusted, so a doctor can never read/write another specialist's rows or
// clinic-wide (NULL-specialist) rows through this route.

const upsertBody = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  replace: z.boolean().optional(),
});

const patchBody = z.object({
  id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6).optional(),
  startMinute: z.number().int().min(0).max(1439).optional(),
  endMinute: z.number().int().min(1).max(1440).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Confirms a working-hours row id belongs to the doctor's own specialist before any
 * mutation by id (the underlying update/deactivate scope only by id+org, so without
 * this check a doctor could touch a sibling specialist's row in the same org).
 */
async function assertOwnedByDoctor(
  deps: ReturnType<typeof buildAppDeps>,
  organizationId: string,
  specialistId: string,
  id: string,
): Promise<boolean> {
  if (!deps.bookingScheduling) return false;
  const rows = await deps.bookingScheduling.listWorkingHoursAdmin({
    organizationId,
    specialistId,
  });
  return rows.some((r) => r.id === id);
}

export async function GET(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const specialistId = await resolveDoctorOwnSpecialistId(gate.ctx);
  if (!specialistId) {
    return NextResponse.json({ ok: false, error: "specialist_not_configured" }, { status: 409 });
  }
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId");
  const roomId = url.searchParams.get("roomId");
  const weekdayRaw = url.searchParams.get("weekday");
  const weekdayParsed = weekdayRaw !== null
    ? z.coerce.number().int().min(0).max(6).safeParse(weekdayRaw)
    : { success: true as const, data: undefined };
  if (!weekdayParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid weekday" }, { status: 400 });
  }
  const [rows, usesFallback] = await Promise.all([
    deps.bookingScheduling.listWorkingHoursAdmin({
      organizationId: gate.ctx.organizationId,
      // FORCED: own specialist only (client cannot widen scope).
      specialistId,
      branchId: branchId === "__none__" ? null : branchId || undefined,
      roomId: roomId === "__none__" ? null : roomId || undefined,
      weekday: weekdayParsed.data,
    }),
    deps.bookingScheduling.usesWorkingHoursFallback({
      organizationId: gate.ctx.organizationId,
      specialistId,
      branchId: branchId === "__none__" ? null : branchId || undefined,
      roomId: roomId === "__none__" ? null : roomId || undefined,
    }),
  ]);
  return NextResponse.json({ ok: true, rows, usesFallback });
}

export async function POST(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = upsertBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.startMinute >= parsed.data.endMinute) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const specialistId = await resolveDoctorOwnSpecialistId(gate.ctx);
  if (!specialistId) {
    return NextResponse.json({ ok: false, error: "specialist_not_configured" }, { status: 409 });
  }
  try {
    const row = await deps.bookingScheduling.createWorkingHours({
      organizationId: gate.ctx.organizationId,
      // FORCED: own specialist only (overrides anything in the body).
      specialistId,
      branchId: parsed.data.branchId ?? undefined,
      roomId: parsed.data.roomId ?? undefined,
      weekday: parsed.data.weekday,
      startMinute: parsed.data.startMinute,
      endMinute: parsed.data.endMinute,
      replace: parsed.data.replace,
    });
    return NextResponse.json({ ok: true, row });
  } catch {
    return NextResponse.json({ ok: false, error: "create_failed" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const specialistId = await resolveDoctorOwnSpecialistId(gate.ctx);
  if (!specialistId) {
    return NextResponse.json({ ok: false, error: "specialist_not_configured" }, { status: 409 });
  }
  if (!(await assertOwnedByDoctor(deps, gate.ctx.organizationId, specialistId, parsed.data.id))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const row = await deps.bookingScheduling.updateWorkingHours({
      organizationId: gate.ctx.organizationId,
      id: parsed.data.id,
      weekday: parsed.data.weekday,
      startMinute: parsed.data.startMinute,
      endMinute: parsed.data.endMinute,
      isActive: parsed.data.isActive,
    });
    return NextResponse.json({ ok: true, row });
  } catch {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const specialistId = await resolveDoctorOwnSpecialistId(gate.ctx);
  if (!specialistId) {
    return NextResponse.json({ ok: false, error: "specialist_not_configured" }, { status: 409 });
  }
  if (!(await assertOwnedByDoctor(deps, gate.ctx.organizationId, specialistId, id))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  await deps.bookingScheduling.deactivateWorkingHours(id, gate.ctx.organizationId);
  return NextResponse.json({ ok: true });
}
