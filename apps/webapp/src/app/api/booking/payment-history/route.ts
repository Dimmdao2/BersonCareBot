import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientBookingTrustedPhoneAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

export async function GET() {
  const gate = await requirePatientBookingTrustedPhoneAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const events = await deps.patientBooking.listPaymentHistory(gate.session.user.userId);
  return NextResponse.json({ ok: true, events });
}
