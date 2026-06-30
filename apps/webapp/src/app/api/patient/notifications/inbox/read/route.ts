/**
 * POST /api/patient/notifications/inbox/read — отметить уведомления пациента прочитанными.
 */
import { NextResponse } from "next/server";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function POST() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  await deps.messaging.patientNotifications.markRead(gate.session.user.userId);
  return NextResponse.json({ ok: true });
}
