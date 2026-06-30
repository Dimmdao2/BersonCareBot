import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorBookingEngine } from "../_requireDoctorBookingEngine";
import { resolveDoctorOwnSpecialistId } from "../_resolveDoctorSpecialistId";

// Doctor-self-scoped mirror of /api/admin/booking-engine/working-schedule-templates.
// Templates themselves are org-level named presets (no specialist column), so list/create/
// delete are org-scoped (gate.ctx.organizationId). The ONE specialist-scoped operation is
// `?action=apply`, which writes per-date rows for a specialist — there the server FORCES the
// doctor's own specialist and ignores any client-supplied specialistId.

const breakIntervalSchema = z.object({
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

const createBody = z.object({
  name: z.string().min(1).max(120),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  breaks: z.array(breakIntervalSchema).max(6).optional(),
  branchId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const applyBody = z.object({
  templateId: z.string().uuid(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
});

function resolveNullableUuid(raw: string | null | undefined): string | null | undefined {
  if (raw === "__none__") return null;
  if (!raw) return undefined;
  return raw;
}

export async function GET(_request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const rows = await deps.bookingScheduling.listScheduleTemplates(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, rows });
}

export async function POST(request: Request) {
  const gate = await requireDoctorBookingEngine();
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
    const specialistId = await resolveDoctorOwnSpecialistId(gate.ctx);
    if (!specialistId) {
      return NextResponse.json({ ok: false, error: "specialist_not_configured" }, { status: 409 });
    }
    try {
      await deps.bookingScheduling.applyScheduleTemplate({
        organizationId: gate.ctx.organizationId,
        templateId: parsed.data.templateId,
        dates: parsed.data.dates,
        // FORCED: own specialist only — apply writes per-date rows scoped by specialist.
        specialistId,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      return NextResponse.json({ ok: false, error: "apply_failed", detail: msg }, { status: 400 });
    }
  }

  // Default: create new (org-level) template.
  const parsed = createBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.startMinute >= parsed.data.endMinute) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  try {
    const row = await deps.bookingScheduling.createScheduleTemplate({
      organizationId: gate.ctx.organizationId,
      name: parsed.data.name,
      startMinute: parsed.data.startMinute,
      endMinute: parsed.data.endMinute,
      breaks: parsed.data.breaks,
      sortOrder: parsed.data.sortOrder,
      branchId: resolveNullableUuid(parsed.data.branchId ?? undefined),
    });
    return NextResponse.json({ ok: true, row });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: "create_failed", detail: msg }, { status: 400 });
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
  await deps.bookingScheduling.deleteScheduleTemplate(id, gate.ctx.organizationId);
  return NextResponse.json({ ok: true });
}
