/**
 * PATCH/DELETE /api/doctor/tasks/:taskId
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { specialistTaskPatchSchema } from "@/modules/specialist-tasks/apiSchemas";

export async function PATCH(
  request: Request,
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

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = specialistTaskPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const existing = await deps.specialistTasks.getByIdForOwner(taskId, session.user.userId);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const clearReminderSent =
    parsed.data.remindAt !== undefined && parsed.data.remindAt !== existing.remindAt;

  try {
    const task = await deps.specialistTasks.update(taskId, session.user.userId, {
      ...parsed.data,
      clearReminderSent,
    });
    if (!task) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    if (e instanceof Error && e.message === "empty_title") {
      return NextResponse.json({ ok: false, error: "empty_title" }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(
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

  const deps = buildAppDeps();
  const deleted = await deps.specialistTasks.delete(taskId, session.user.userId);
  if (!deleted) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
