import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import { revalidatePatientTreatmentProgramUi } from "@/app-layer/cache/revalidatePatientTreatmentProgramUi";
import { mapTemplateStageItemToInstanceStageItemId } from "@/modules/treatment-program/mapTemplateStageItemToInstanceItem";

const bodySchema = z.object({
  templateStageItemId: z.string().uuid(),
  markComplete: z.boolean().optional(),
  localComment: z.union([z.string(), z.null()]).optional(),
});

export async function POST(req: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientTreatmentPromoDefault });
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const markComplete = parsed.data.markComplete === true;
  const hasComment = Object.prototype.hasOwnProperty.call(parsed.data, "localComment");
  if (!markComplete && !hasComment) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const userId = gate.session.user.userId;

  const templateId = await deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId();
  if (!templateId) {
    return NextResponse.json({ ok: false, error: "Промо-программа не настроена" }, { status: 400 });
  }

  let tpl;
  try {
    tpl = await deps.treatmentProgram.getTemplate(templateId);
  } catch {
    return NextResponse.json({ ok: false, error: "Шаблон не найден" }, { status: 400 });
  }
  if (tpl.status !== "published") {
    return NextResponse.json({ ok: false, error: "Шаблон недоступен" }, { status: 400 });
  }

  const tplHasItem = tpl.stages.some((s) => s.items.some((i) => i.id === parsed.data.templateStageItemId));
  if (!tplHasItem) {
    return NextResponse.json({ ok: false, error: "Элемент не найден" }, { status: 400 });
  }

  let detail;
  try {
    detail = await deps.treatmentProgramInstance.ensureDefaultPromoProgramForPatient({ patientUserId: userId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const mappedId = mapTemplateStageItemToInstanceStageItemId(tpl, detail, parsed.data.templateStageItemId);
  if (!mappedId) {
    return NextResponse.json({ ok: false, error: "Не удалось сопоставить элемент" }, { status: 400 });
  }

  if (hasComment) {
    try {
      await deps.treatmentProgramInstance.updateStageItemLocalComment({
        instanceId: detail.id,
        stageItemId: mappedId,
        localComment: parsed.data.localComment ?? null,
        actorId: userId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
  }

  if (markComplete) {
    try {
      await deps.treatmentProgramProgress.patientCompleteSimpleItem({
        patientUserId: userId,
        instanceId: detail.id,
        stageItemId: mappedId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
  }

  revalidatePatientTreatmentProgramUi();
  revalidatePath(routePaths.patientReminders);

  const nav = routePaths.patientTreatmentProgramItem(detail.id, mappedId, "exec", "program");
  return NextResponse.json({
    ok: true,
    instanceId: detail.id,
    stageItemId: mappedId,
    redirect: nav,
  });
}
