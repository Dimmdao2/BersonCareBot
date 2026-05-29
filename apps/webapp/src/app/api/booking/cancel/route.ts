import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientBookingTrustedPhoneAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().max(400).optional(),
});

export async function POST(request: Request) {
  const gate = await requirePatientBookingTrustedPhoneAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const result = await deps.patientBooking.cancelBooking({
    userId: session.user.userId,
    bookingId: parsed.data.bookingId,
    reason: parsed.data.reason,
  });
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (result.error === "already_cancelled") {
      return NextResponse.json({ ok: false, error: "already_cancelled" }, { status: 409 });
    }
    if (result.error === "not_allowed" || result.error === "staff_confirmation_required") {
      return NextResponse.json({ ok: false, error: result.error }, { status: 403 });
    }
    if (result.error === "lifecycle_failed" || result.error === "sync_failed") {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
