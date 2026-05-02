/**
 * GET /api/doctor/messages/unread-count — непрочитанные сообщения от пользователей (роль user):
 * - глобально;
 * - или для конкретного пациента (`?patientUserId=<uuid>`).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const patientUserIdSchema = z.string().uuid();

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const deps = buildAppDeps();
  const url = new URL(request.url);
  const patientUserIdRaw = url.searchParams.get("patientUserId");
  const patientUserId = patientUserIdRaw?.trim() ? patientUserIdRaw.trim() : null;

  let unreadCount: number;
  if (patientUserId) {
    if (!patientUserIdSchema.safeParse(patientUserId).success) {
      return NextResponse.json({ ok: false, error: "invalid_patient_user_id" }, { status: 400 });
    }
    const identity = await deps.doctorClientsPort.getClientIdentity(patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "patient_not_found" }, { status: 404 });
    }
    unreadCount = await deps.messaging.doctorSupport.unreadFromPatient(patientUserId);
  } else {
    unreadCount = await deps.messaging.doctorSupport.unreadFromUsers();
  }
  return NextResponse.json({ ok: true, unreadCount });
}
