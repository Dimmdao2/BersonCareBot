/**
 * GET  /api/doctor/treatment-program-promo — текущий промо-шаблон и счётчики
 * PATCH /api/doctor/treatment-program-promo — задать промо-шаблон (admin scope)
 * Guard: role doctor | admin
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { canAccessDoctor } from "@/modules/roles/service";
import { invalidateConfigKey } from "@/modules/system-settings/configAdapter";
import {
  normalizePatientDefaultPromoTreatmentProgramTemplatePatch,
  PATIENT_DEFAULT_PROMO_TREATMENT_PROGRAM_TEMPLATE_ID_KEY,
} from "@/modules/system-settings/patientDefaultPromoTreatmentProgramTemplate";

const patchBodySchema = z.object({
  templateId: z.string(),
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const deps = buildAppDeps();
  const [templateId, activePromo, completedPromo] = await Promise.all([
    deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId(),
    deps.treatmentProgramInstance.countInstancesForAssignmentSource({
      assignmentSource: "promo",
      status: "active",
    }),
    deps.treatmentProgramInstance.countInstancesForAssignmentSource({
      assignmentSource: "promo",
      status: "completed",
    }),
  ]);

  return NextResponse.json({
    ok: true,
    templateId: templateId ?? "",
    stats: { activePromo, completedPromo },
  });
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const normalized = await normalizePatientDefaultPromoTreatmentProgramTemplatePatch(
    (id) => deps.treatmentProgram.getTemplate(id),
    parsed.data.templateId,
  );
  if (!normalized.ok) {
    return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
  }

  await deps.systemSettings.updateSetting(
    PATIENT_DEFAULT_PROMO_TREATMENT_PROGRAM_TEMPLATE_ID_KEY,
    "admin",
    normalized.valueJson,
    session.user.userId,
  );
  invalidateConfigKey(PATIENT_DEFAULT_PROMO_TREATMENT_PROGRAM_TEMPLATE_ID_KEY);

  return NextResponse.json({
    ok: true,
    templateId: normalized.valueJson.value,
  });
}
