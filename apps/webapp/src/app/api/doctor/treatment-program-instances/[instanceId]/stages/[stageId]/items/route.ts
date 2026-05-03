import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { TREATMENT_PROGRAM_ITEM_TYPES } from "@/modules/treatment-program/types";
import { revalidatePatientTreatmentProgramUi } from "@/app-layer/cache/revalidatePatientTreatmentProgramUi";

const postBodySchema = z.object({
  itemType: z.enum(TREATMENT_PROGRAM_ITEM_TYPES),
  itemRefId: z.string().uuid(),
  sortOrder: z.number().int().optional(),
  comment: z.string().max(20000).optional().nullable(),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  groupId: z.string().uuid().optional().nullable(),
});

export async function POST(
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
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const inst = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    if (!inst) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const identity = await deps.doctorClientsPort.getClientIdentity(inst.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const item = await deps.treatmentProgramInstance.doctorAddStageItem({
      instanceId,
      stageId,
      actorId: session.user.userId,
      itemType: parsed.data.itemType,
      itemRefId: parsed.data.itemRefId,
      sortOrder: parsed.data.sortOrder,
      comment: parsed.data.comment,
      settings: parsed.data.settings,
      groupId: parsed.data.groupId ?? undefined,
    });
    revalidatePatientTreatmentProgramUi();
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
