import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { TREATMENT_PROGRAM_ITEM_TYPES } from "@/modules/treatment-program/types";

const patchBodySchema = z
  .object({
    localComment: z.union([z.string().max(20000), z.null()]).optional(),
    replace: z
      .object({
        itemType: z.enum(TREATMENT_PROGRAM_ITEM_TYPES),
        itemRefId: z.string().uuid(),
      })
      .optional(),
  })
  .refine((b) => b.localComment !== undefined || b.replace !== undefined, {
    message: "empty_patch",
  });

const deleteBodySchema = z.object({
  reason: z.string().min(1).max(20000),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId, itemId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(itemId).success) {
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

    if (parsed.data.replace) {
      const row = await deps.treatmentProgramInstance.doctorReplaceStageItem({
        instanceId,
        itemId,
        actorId: session.user.userId,
        itemType: parsed.data.replace.itemType,
        itemRefId: parsed.data.replace.itemRefId,
      });
      return NextResponse.json({ ok: true, item: row });
    }

    const row = await deps.treatmentProgramInstance.updateStageItemLocalComment({
      instanceId,
      stageItemId: itemId,
      localComment: parsed.data.localComment!,
      actorId: session.user.userId,
    });
    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId, itemId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(itemId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = deleteBodySchema.safeParse(raw);
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
    await deps.treatmentProgramInstance.doctorRemoveStageItem({
      instanceId,
      itemId,
      actorId: session.user.userId,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
