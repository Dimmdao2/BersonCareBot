import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const PutSchema = z.object({
  specialistId: z.string().uuid().nullable().optional(),
  bufferMinutes: z.number().int().min(0).max(240).optional(),
  minNoticeHours: z.number().int().min(0).max(168).optional(),
});

function parseMinNoticeHours(valueJson: unknown): number {
  const inner =
    valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)
      ? (valueJson as { value: unknown }).value
      : valueJson;
  const n =
    typeof inner === "number" && Number.isFinite(inner)
      ? inner
      : typeof inner === "string" && /^\d+$/.test(inner.trim())
        ? Number.parseInt(inner.trim(), 10)
        : 0;
  return Math.max(0, Math.min(168, Math.round(n)));
}

export async function GET(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  const url = new URL(request.url);
  const specialistId = url.searchParams.get("specialistId");
  const [bufferMinutes, minNoticeRow] = await Promise.all([
    deps.bookingScheduling.getBufferMinutes(
      gate.ctx.organizationId,
      specialistId && specialistId !== "__none__" ? specialistId : null,
    ),
    deps.systemSettings.getSetting("booking_min_notice_hours", "admin"),
  ]);
  return NextResponse.json({
    ok: true,
    bufferMinutes,
    minNoticeHours: parseMinNoticeHours(minNoticeRow?.valueJson ?? null),
  });
}

export async function PUT(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json({ ok: false, error: "booking_scheduling_unavailable" }, { status: 503 });
  }
  if (parsed.data.bufferMinutes != null) {
    await deps.bookingScheduling.upsertBufferMinutes({
      organizationId: gate.ctx.organizationId,
      specialistId: parsed.data.specialistId ?? null,
      minutes: parsed.data.bufferMinutes,
    });
  }
  if (parsed.data.minNoticeHours != null) {
    await deps.systemSettings.updateSetting(
      "booking_min_notice_hours",
      "admin",
      { value: parsed.data.minNoticeHours },
      gate.ctx.session.user.userId,
    );
  }
  const bufferMinutes = await deps.bookingScheduling.getBufferMinutes(
    gate.ctx.organizationId,
    parsed.data.specialistId ?? null,
  );
  const minNoticeRow = await deps.systemSettings.getSetting("booking_min_notice_hours", "admin");
  return NextResponse.json({
    ok: true,
    bufferMinutes,
    minNoticeHours: parseMinNoticeHours(minNoticeRow?.valueJson ?? null),
  });
}
