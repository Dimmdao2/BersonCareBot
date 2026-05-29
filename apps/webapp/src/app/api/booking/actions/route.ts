import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientBookingTrustedPhoneAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

export async function GET(request: Request) {
  const gate = await requirePatientBookingTrustedPhoneAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const url = new URL(request.url);
  const bookingId = url.searchParams.get("bookingId")?.trim();
  if (!bookingId) {
    return NextResponse.json({ ok: false, error: "missing_booking_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const [cancelPreview, reschedulePreview] = await Promise.all([
    deps.patientBooking.previewCancel({ userId: session.user.userId, bookingId }),
    deps.patientBooking.previewReschedule({ userId: session.user.userId, bookingId }),
  ]);

  return NextResponse.json({
    ok: true,
    cancel: cancelPreview,
    reschedule: reschedulePreview,
  });
}
