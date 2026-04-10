import { NextResponse } from "next/server";
import { requirePatientApiSessionWithPhone } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";

/**
 * GET /api/patient/reminders/unread-count — для polling из PatientHeader.
 * Auth: 401/403 как у `/api/patient/messages/unread-count` (не redirect: это fetch API).
 * Ошибки БД (нет колонки и т.п.) → graceful { ok: true, count: 0 }.
 */
export async function GET() {
  const gate = await requirePatientApiSessionWithPhone({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const deps = buildAppDeps();
  try {
    const count = await deps.reminderProjection.getUnseenCount(session.user.userId);
    return NextResponse.json({ ok: true, count });
  } catch {
    return NextResponse.json({ ok: true, count: 0 });
  }
}
