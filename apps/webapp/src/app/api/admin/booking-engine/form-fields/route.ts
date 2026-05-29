import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const upsertBody = z.object({
  id: z.string().uuid().optional(),
  fieldKey: z.string().min(1),
  fieldType: z.string().min(1),
  label: z.string().min(1),
  placeholder: z.string().optional(),
  isRequired: z.boolean(),
  visibleToPatient: z.boolean(),
  visibleToStaff: z.boolean(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export async function GET() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingEngine || !deps.bookingForm) {
    return NextResponse.json({ ok: false, error: "booking_engine_unavailable" }, { status: 503 });
  }
  const orgId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const fields = await deps.bookingForm.listAdminFields(orgId);
  return NextResponse.json({ ok: true, fields });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = upsertBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingEngine || !deps.bookingForm) {
    return NextResponse.json({ ok: false, error: "booking_engine_unavailable" }, { status: 503 });
  }
  const orgId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const field = await deps.bookingForm.upsertAdminField(orgId, {
    ...parsed.data,
    placeholder: parsed.data.placeholder ?? null,
  });
  return NextResponse.json({ ok: true, field });
}
