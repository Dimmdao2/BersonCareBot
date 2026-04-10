import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const deps = buildAppDeps();
  const records = await deps.patientBooking.listMyBookings(session.user.userId);
  return NextResponse.json({ ok: true, ...records }, { status: 200 });
}
