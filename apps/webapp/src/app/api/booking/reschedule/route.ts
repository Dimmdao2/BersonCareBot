import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientBookingTrustedPhoneAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  reason: z.string().trim().max(400).optional(),
});

export async function POST(request: Request) {
  const gate = await requirePatientBookingTrustedPhoneAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const result = await deps.patientBooking.rescheduleBooking({
    userId: session.user.userId,
    bookingId: parsed.data.bookingId,
    slotStart: parsed.data.slotStart,
    slotEnd: parsed.data.slotEnd,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "slot_overlap"
          ? 409
          : result.error === "staff_confirmation_required"
            ? 403
            : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, booking: result.booking });
}
