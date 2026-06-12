import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

/** Список перекрытий (GET) ожидает dateFrom/dateTo (YYYY-MM-DD). */
const getQuery = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  specialistId: z.string().uuid().nullable().optional(),
  /** Optional branch filter (§13.2, E3): filter grid by branchId. */
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
  /** Legacy single-break (backward-compat). Ignored when breaks[] is provided. */
  breakStartMinute: z.number().int().min(0).max(1439).nullable().optional(),
  breakEndMinute: z.number().int().min(1).max(1440).nullable().optional(),
  /** N-break model. Takes priority over breakStartMinute/breakEndMinute. */
  breaks: z.array(breakIntervalSchema).max(6).optional(),
  specialistId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
});

const closeSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  specialistId: z.string().uuid().nullable().optional(),
});

const clearSchema = closeSchema;

const putBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upsert"), ...upsertSchema.shape }),
  z.object({ action: z.literal("close"), ...closeSchema.shape }),
  z.object({ action: z.literal("clear"), ...clearSchema.shape }),
]);

function resolveNullableUuid(raw: string | null | undefined): string | null | undefined {
  if (raw === "__none__") return null;
  if (!raw) return undefined;
  return raw;
}

export async function GET(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const url = new URL(request.url);
  const rawSpecialistId = url.searchParams.get("specialistId");
  const rawBranchId = url.searchParams.get("branchId");
  const parsed = getQuery.safeParse({
    dateFrom: url.searchParams.get("dateFrom"),
    dateTo: url.searchParams.get("dateTo"),
    // Pre-resolve __none__ sentinel before Zod uuid validation
    specialistId: rawSpecialistId === "__none__" ? null : rawSpecialistId,
    branchId: rawBranchId === "__none__" ? null : rawBranchId,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }
  const { dateFrom, dateTo, specialistId, branchId } = parsed.data;
  // specialistId / branchId already resolved from __none__ sentinel above; pass as-is
  const rows = await deps.bookingScheduling.listWorkingDays({
    organizationId: gate.ctx.organizationId,
    dateFrom,
    dateTo,
    specialistId,
    branchId,
  });
  return NextResponse.json({ ok: true, rows });
}

export async function PUT(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = putBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const orgId = gate.ctx.organizationId;
  try {
    if (parsed.data.action === "upsert") {
      const { action: _, ...rest } = parsed.data;
      await deps.bookingScheduling.upsertWorkingDays({
        organizationId: orgId,
        ...rest,
        specialistId: resolveNullableUuid(rest.specialistId ?? undefined),
        branchId: resolveNullableUuid(rest.branchId ?? undefined),
        roomId: resolveNullableUuid(rest.roomId ?? undefined),
      });
    } else if (parsed.data.action === "close") {
      const { action: _, ...rest } = parsed.data;
      await deps.bookingScheduling.closeWorkingDays({
        organizationId: orgId,
        ...rest,
        specialistId: resolveNullableUuid(rest.specialistId ?? undefined),
      });
    } else {
      const { action: _, ...rest } = parsed.data;
      await deps.bookingScheduling.clearWorkingDays({
        organizationId: orgId,
        ...rest,
        specialistId: resolveNullableUuid(rest.specialistId ?? undefined),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: "operation_failed", detail: msg }, { status: 400 });
  }
}
