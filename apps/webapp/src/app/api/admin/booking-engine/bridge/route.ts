import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const PatchBridgeSchema = z.object({
  enabled: z.boolean(),
});

export async function GET() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const enabled = await gate.ctx.service.bridge.isBridgeEnabled();
  const mapping = await gate.ctx.service.bridge.getMappingSummary(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, enabled, mapping });
}

export async function PATCH(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PatchBridgeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const settings = buildAppDeps().systemSettings;
  if (!settings) {
    return NextResponse.json({ ok: false, error: "settings_unavailable" }, { status: 503 });
  }
  await settings.updateSetting(
    "booking_rubitime_bridge_enabled",
    "admin",
    parsed.data.enabled,
    gate.ctx.session.user.userId,
  );
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}

export async function POST() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  try {
    const result = await gate.ctx.service.bridge.projectAll(gate.ctx.organizationId);
    const mapping = await gate.ctx.service.bridge.getMappingSummary(gate.ctx.organizationId);
    return NextResponse.json({ ok: true, projection: result, mapping });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isOverlap =
      message.includes("be_appointments_specialist_no_overlap") || message.includes("23P01");
    return NextResponse.json(
      {
        ok: false,
        error: isOverlap ? "appointment_slot_overlap" : "projection_failed",
        message,
      },
      { status: isOverlap ? 409 : 500 },
    );
  }
}
