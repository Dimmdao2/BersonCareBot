import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const breakIntervalSchema = z.object({
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

const createBody = z.object({
  name: z.string().min(1).max(120),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  /** N-break model (legacy scalar columns dropped in migration 0118). */
  breaks: z.array(breakIntervalSchema).max(6).optional(),
  branchId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const applyBody = z.object({
  templateId: z.string().uuid(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  specialistId: z.string().uuid().nullable().optional(),
});

function resolveNullableUuid(raw: string | null | undefined): string | null | undefined {
  if (raw === "__none__") return null;
  if (!raw) return undefined;
  return raw;
}

export async function GET(_request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const rows = await deps.bookingScheduling.listScheduleTemplates(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, rows });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }

  if (action === "apply") {
    const parsed = applyBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }
    try {
      await deps.bookingScheduling.applyScheduleTemplate({
        organizationId: gate.ctx.organizationId,
        templateId: parsed.data.templateId,
        dates: parsed.data.dates,
        specialistId: resolveNullableUuid(parsed.data.specialistId ?? undefined),
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      return NextResponse.json({ ok: false, error: "apply_failed", detail: msg }, { status: 400 });
    }
  }

  // Default: create new template
  const parsed = createBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.startMinute >= parsed.data.endMinute) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  try {
    const row = await deps.bookingScheduling.createScheduleTemplate({
      organizationId: gate.ctx.organizationId,
      ...parsed.data,
      branchId: resolveNullableUuid(parsed.data.branchId ?? undefined),
    });
    return NextResponse.json({ ok: true, row });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: "create_failed", detail: msg }, { status: 400 });
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
  await deps.bookingScheduling.deleteScheduleTemplate(id, gate.ctx.organizationId);
  return NextResponse.json({ ok: true });
}
