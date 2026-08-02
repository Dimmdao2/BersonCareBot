/**
 * GET  /api/doctor/treatment-program-promo — текущий промо-шаблон и счётчики
 * PATCH /api/doctor/treatment-program-promo — задать промо-шаблон (admin scope)
 * Guard: role doctor | admin
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import {
  entitlementMutationRefusalResponse,
  requireEntitlementForRead,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { systemSettingsOrgContextErrorResponse } from '@/app-layer/guards/systemSettingsOrgContextResponse';
import { invalidateConfigKey } from '@/modules/system-settings/configAdapter';
import {
  normalizePatientDefaultPromoTreatmentProgramTemplatePatch,
  PATIENT_DEFAULT_PROMO_TREATMENT_PROGRAM_TEMPLATE_ID_KEY,
} from '@/modules/system-settings/patientDefaultPromoTreatmentProgramTemplate';

const patchBodySchema = z.object({
  templateId: z.string(),
});

/** `patient_default_promo_treatment_program_template_id` is PER-ORG (owner-explicit example, see `orgScopedKeys.ts`). */
export async function GET() {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForRead(gate.ctx, 'promo');
  if (!entitlement.ok) return entitlement.response;

  const deps = buildAppDeps();
  const [templateId, activePromo, completedPromo] = await Promise.all([
    deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId({
      organizationId: gate.ctx.organizationId,
    }),
    deps.treatmentProgramInstance.countInstancesForAssignmentSource({
      assignmentSource: 'promo',
      status: 'active',
    }),
    deps.treatmentProgramInstance.countInstancesForAssignmentSource({
      assignmentSource: 'promo',
      status: 'completed',
    }),
  ]);

  return NextResponse.json({
    ok: true,
    templateId: templateId ?? '',
    stats: { activePromo, completedPromo },
  });
}

export async function PATCH(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'promo');
  if (!entitlement.ok) {
    return entitlementMutationRefusalResponse('promo', 'изменить промо-программу');
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const normalized = await normalizePatientDefaultPromoTreatmentProgramTemplatePatch(
    (id) => deps.treatmentProgram.getTemplate(id),
    parsed.data.templateId,
  );
  if (!normalized.ok) {
    return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
  }

  try {
    await deps.systemSettings.updateSetting(
      PATIENT_DEFAULT_PROMO_TREATMENT_PROGRAM_TEMPLATE_ID_KEY,
      'admin',
      normalized.valueJson,
      gate.ctx.session.user.userId,
      { organizationId: gate.ctx.organizationId },
    );
  } catch (error) {
    const errResponse = systemSettingsOrgContextErrorResponse(error);
    if (errResponse) return errResponse;
    throw error;
  }
  invalidateConfigKey(PATIENT_DEFAULT_PROMO_TREATMENT_PROGRAM_TEMPLATE_ID_KEY);

  return NextResponse.json({
    ok: true,
    templateId: normalized.valueJson.value,
  });
}
