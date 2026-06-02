/**
 * POST /api/doctor/tasks/:taskId/complete
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { taskId } = await context.params;
  if (!z.string().uuid().safeParse(taskId).success) {
    return NextResponse.json({ ok: false, error: "invalid_task" }, { status: 400 });
  }

  const task = await buildAppDeps().specialistTasks.complete(taskId, session.user.userId);
  if (!task) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, task });
}
