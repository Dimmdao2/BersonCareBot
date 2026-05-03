import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const patchBodySchema = z
  .object({
    status: z.enum(["locked", "available", "in_progress", "completed", "skipped"]).optional(),
    reason: z.string().max(20000).optional().nullable(),
    goals: z.string().max(200000).optional().nullable(),
    objectives: z.string().max(200000).optional().nullable(),
    expectedDurationDays: z.number().int().min(0).max(36500).optional().nullable(),
    expectedDurationText: z.string().max(20000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const hasMeta =
      data.goals !== undefined ||
      data.objectives !== undefined ||
      data.expectedDurationDays !== undefined ||
      data.expectedDurationText !== undefined;
    if (data.status === undefined && !hasMeta) {
      ctx.addIssue({
        code: "custom",
        message: "Укажите status и/или поля целей этапа",
        path: [],
      });
    }
    if (data.status === "skipped") {
      const r = data.reason?.trim();
      if (!r) {
        ctx.addIssue({
          code: "custom",
          message: "Для пропуска этапа укажите причину",
          path: ["reason"],
        });
      }
    }
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
    if (!inst0) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const identity = await deps.doctorClientsPort.getClientIdentity(inst0.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const d = parsed.data;
    let detail = inst0;

    if (d.status !== undefined) {
      detail = await deps.treatmentProgramProgress.doctorSetStageStatus({
        instanceId,
        stageId,
        status: d.status,
        reason: d.reason,
        doctorUserId: session.user.userId,
      });
    }

    const hasMeta =
      d.goals !== undefined ||
      d.objectives !== undefined ||
      d.expectedDurationDays !== undefined ||
      d.expectedDurationText !== undefined;

    if (hasMeta) {
      detail = await deps.treatmentProgramInstance.doctorUpdateInstanceStageMetadata({
        instanceId,
        stageId,
        actorId: session.user.userId,
        patch: {
          goals: d.goals,
          objectives: d.objectives,
          expectedDurationDays: d.expectedDurationDays,
          expectedDurationText: d.expectedDurationText,
        },
      });
    }

    return NextResponse.json({ ok: true, item: detail });
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
    if (!inst0) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
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
