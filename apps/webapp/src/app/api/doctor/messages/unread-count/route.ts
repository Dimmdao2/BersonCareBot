/**
 * GET /api/doctor/messages/unread-count — непрочитанные сообщения от пользователей (роль user), глобально.
 */
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const deps = buildAppDeps();
  const unreadCount = await deps.messaging.doctorSupport.unreadFromUsers();
  return NextResponse.json({ ok: true, unreadCount });
}
