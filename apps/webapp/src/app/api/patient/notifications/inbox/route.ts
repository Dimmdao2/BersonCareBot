/**
 * GET /api/patient/notifications/inbox — уведомления пациента без поля ответа.
 */
import { NextResponse } from "next/server";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { serializeSupportMessage } from "@/modules/messaging/serializeSupportMessage";

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const data = await deps.messaging.patientNotifications.bootstrap(gate.session.user.userId);
  return NextResponse.json({
    ok: true,
    messages: data.messages.map(serializeSupportMessage),
    unreadCount: data.unreadCount,
  });
}
