/**
 * GET /api/patient/messages/unread-count — число непрочитанных входящих от админа.
 */
import { NextResponse } from "next/server";
import { requirePatientApiSessionWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET() {
  const gate = await requirePatientApiSessionWithPhone({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const deps = buildAppDeps();
  const unreadCount = await deps.messaging.patient.unreadCount(session.user.userId);
  return NextResponse.json({ ok: true, unreadCount });
}
