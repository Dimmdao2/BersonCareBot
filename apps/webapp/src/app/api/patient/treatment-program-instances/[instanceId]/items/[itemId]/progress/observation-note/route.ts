import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { revalidatePatientTreatmentProgramUi } from "@/app-layer/cache/revalidatePatientTreatmentProgramUi";
import { assertPatientProgramCommentsAllowed } from "@/modules/doctor-clients/assertPatientProgramInteraction";
import { isPatientProgramDiscussionUiEnabled } from "@/modules/program-item-discussion/discussionFeatureGates";

const bodySchema = z.object({
  note: z.string().min(1).max(4000),
});

export async function POST(
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
  const detail = await deps.treatmentProgramInstance.getInstanceForPatient(
    gate.session.user.userId,
    instanceId,
  );
  if (!detail) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (detail.assignmentSource !== "doctor") {
    return NextResponse.json({ ok: false, error: "program_not_doctor_assigned" }, { status: 400 });
  }
  if (!(await isPatientProgramDiscussionUiEnabled(deps))) {
    return NextResponse.json({ ok: false, error: "feature_disabled" }, { status: 403 });
  }
  const supportGate = await assertPatientProgramCommentsAllowed(deps, gate.session.user.userId);
  if (!supportGate.ok) {
    return NextResponse.json({ ok: false, error: supportGate.error }, { status: 403 });
  }

  try {
    await deps.treatmentProgramPatientActions.patientAppendObservationNote({
      patientUserId: gate.session.user.userId,
      instanceId,
      stageItemId: itemId,
      note: body.note,
    });
    revalidatePatientTreatmentProgramUi();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status =
      msg.includes("не найден") ||
      msg.includes("не найдена") ||
      msg.includes("Элемент не найден") ||
      msg.includes("Этап не найден") ||
      msg.includes("Программа не найдена")
        ? 404
        : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
