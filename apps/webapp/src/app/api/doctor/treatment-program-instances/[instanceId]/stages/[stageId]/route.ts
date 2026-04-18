import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const patchBodySchema = z.object({
  status: z.enum(["locked", "available", "in_progress", "completed", "skipped"]),
  reason: z.string().max(20000).optional().nullable(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ instanceId: string; stageId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId, stageId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(stageId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const inst0 = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    const identity = await deps.doctorClientsPort.getClientIdentity(inst0.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const item = await deps.treatmentProgramProgress.doctorSetStageStatus({
      instanceId,
      stageId,
      status: parsed.data.status,
      reason: parsed.data.reason,
      doctorUserId: session.user.userId,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ instanceId: string; stageId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId, stageId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(stageId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const inst0 = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    const identity = await deps.doctorClientsPort.getClientIdentity(inst0.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    await deps.treatmentProgramInstance.doctorRemoveStage({
      instanceId,
      stageId,
      actorId: session.user.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
