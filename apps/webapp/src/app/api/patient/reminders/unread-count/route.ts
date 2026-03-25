import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";

/**
 * GET /api/patient/reminders/unread-count — для polling из PatientHeader.
 * Auth: 401/403 как у `/api/patient/messages/unread-count` (не redirect: это fetch API).
 * Ошибки БД (нет колонки и т.п.) → graceful { ok: true, count: 0 }.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const deps = buildAppDeps();
  try {
    const count = await deps.reminderProjection.getUnseenCount(session.user.userId);
    return NextResponse.json({ ok: true, count });
  } catch {
    return NextResponse.json({ ok: true, count: 0 });
  }
}
