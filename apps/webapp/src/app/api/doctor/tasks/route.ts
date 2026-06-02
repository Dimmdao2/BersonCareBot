/**
 * GET/POST /api/doctor/tasks — глобальные задачи специалиста (без patient_user_id).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { specialistTaskBodySchema } from "@/modules/specialist-tasks/apiSchemas";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const includeCompleted = url.searchParams.get("includeCompleted") === "1";
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.min(100, Math.max(1, Number.parseInt(limitRaw, 10) || 20)) : 20;

  const deps = buildAppDeps();
  const tasks = await deps.specialistTasks.listForOwner({
    ownerUserId: session.user.userId,
    patientUserId: null,
    includeCompleted,
    limit: includeCompleted ? undefined : limit,
  });

  return NextResponse.json({ ok: true, tasks });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = specialistTaskBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  if (parsed.data.patientUserId) {
    const deps = buildAppDeps();
    const identity = await deps.doctorClientsPort.getClientIdentity(parsed.data.patientUserId);
    if (!identity) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const deps = buildAppDeps();
  try {
    const task = await deps.specialistTasks.create({
      ownerUserId: session.user.userId,
      patientUserId: parsed.data.patientUserId ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      dueAt: parsed.data.dueAt ?? null,
      remindAt: parsed.data.remindAt ?? null,
      isImportant: parsed.data.isImportant ?? false,
    });
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    if (e instanceof Error && e.message === "empty_title") {
      return NextResponse.json({ ok: false, error: "empty_title" }, { status: 400 });
    }
    throw e;
  }
}
