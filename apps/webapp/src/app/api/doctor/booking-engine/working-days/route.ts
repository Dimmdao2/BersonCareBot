import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorBookingEngine } from "../_requireDoctorBookingEngine";
import { resolveDoctorOwnSpecialistId } from "../_resolveDoctorSpecialistId";

// Doctor-self-scoped mirror of /api/admin/booking-engine/working-days (per-date overrides).
// The server resolves the doctor's own specialist and FORCES it on list/upsert/close/clear;
// any client-supplied specialistId is ignored, so a doctor can only read/write their own
// per-date rows (never another specialist's, never clinic-wide NULL rows).

const getQuery = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().uuid().nullable().optional(),
});

const breakIntervalSchema = z.object({
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

const upsertSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  breaks: z.array(breakIntervalSchema).max(6).optional(),
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
});

const closeSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
});

const putBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upsert"), ...upsertSchema.shape }),
  z.object({ action: z.literal("close"), ...closeSchema.shape }),
  z.object({ action: z.literal("clear"), ...closeSchema.shape }),
]);

function resolveNullableUuid(raw: string | null | undefined): string | null | undefined {
  if (raw === "__none__") return null;
  if (!raw) return undefined;
  return raw;
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
  const rawBranchId = url.searchParams.get("branchId");
  const parsed = getQuery.safeParse({
    dateFrom: url.searchParams.get("dateFrom"),
    dateTo: url.searchParams.get("dateTo"),
    branchId: rawBranchId === "__none__" ? null : (rawBranchId ?? undefined),
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }
  const rows = await deps.bookingScheduling.listWorkingDays({
    organizationId: gate.ctx.organizationId,
    // FORCED: own specialist only.
    specialistId,
    dateFrom: parsed.data.dateFrom,
    dateTo: parsed.data.dateTo,
    branchId: parsed.data.branchId,
  });
  return NextResponse.json({ ok: true, rows });
}

export async function PUT(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = putBody.safeParse(await request.json().catch(() => null));
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
  const orgId = gate.ctx.organizationId;
  try {
    if (parsed.data.action === "upsert") {
      const { action: _action, ...rest } = parsed.data;
      await deps.bookingScheduling.upsertWorkingDays({
        organizationId: orgId,
        dates: rest.dates,
        startMinute: rest.startMinute,
        endMinute: rest.endMinute,
        breaks: rest.breaks,
        // FORCED: own specialist only.
        specialistId,
        branchId: resolveNullableUuid(rest.branchId ?? undefined),
        roomId: resolveNullableUuid(rest.roomId ?? undefined),
      });
    } else if (parsed.data.action === "close") {
      await deps.bookingScheduling.closeWorkingDays({
        organizationId: orgId,
        dates: parsed.data.dates,
        specialistId,
      });
    } else {
      await deps.bookingScheduling.clearWorkingDays({
        organizationId: orgId,
        dates: parsed.data.dates,
        specialistId,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: "operation_failed", detail: msg }, { status: 400 });
  }
}
