import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ instanceId: string; stageItemId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId, stageItemId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(stageItemId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const instance = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    if (!instance) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const hasItem = instance.stages.some((stage) => stage.items.some((item) => item.id === stageItemId));
    if (!hasItem) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    await deps.programItemDiscussion.markReadForViewer({
      viewerUserId: session.user.userId,
      stageItemId,
      lastReadAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
