import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { revalidatePatientTreatmentProgramUi } from "@/app-layer/cache/revalidatePatientTreatmentProgramUi";

const bodySchema = z.object({
  localComment: z.union([z.string().max(20000), z.null()]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId, itemId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(itemId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json = (await request.json()) as unknown;
    body = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    let detail;
    try {
      detail = await deps.treatmentProgramInstance.getInstanceForPatient(
        gate.session.user.userId,
        instanceId,
      );
    } catch {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const exists = detail.stages.some((s) => s.items.some((it) => it.id === itemId));
    if (!exists) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const row = await deps.treatmentProgramInstance.updateStageItemLocalComment({
      instanceId,
      stageItemId: itemId,
      localComment: body.localComment,
      actorId: gate.session.user.userId,
    });
    revalidatePatientTreatmentProgramUi();
    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("не найден") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
