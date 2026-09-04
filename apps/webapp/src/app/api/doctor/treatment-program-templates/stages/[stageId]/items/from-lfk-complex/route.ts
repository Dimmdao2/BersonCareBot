import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  GROUP_DESCRIPTION_CONFLICT,
  isTreatmentProgramExpandNotFoundError,
  isTreatmentProgramTemplateAlreadyArchivedError,
  isTreatmentProgramTemplateGroupDescriptionConflictError,
} from '@/modules/treatment-program/errors';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const expandBodySchema = z.discriminatedUnion('mode', [
  z.object({
    templateId: z.string().uuid(),
    complexTemplateId: z.string().uuid(),
    copyComplexDescriptionToGroup: z.boolean(),
    mode: z.literal('new_group'),
    newGroupTitle: z.string().min(1).max(2000),
  }),
  z.object({
    templateId: z.string().uuid(),
    complexTemplateId: z.string().uuid(),
    copyComplexDescriptionToGroup: z.boolean(),
    mode: z.literal('ungrouped'),
  }),
  z.object({
    templateId: z.string().uuid(),
    complexTemplateId: z.string().uuid(),
    copyComplexDescriptionToGroup: z.boolean(),
    mode: z.literal('existing_group'),
    existingGroupId: z.string().uuid(),
  }),
]);

export async function POST(request: Request, ctx: { params: Promise<{ stageId: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { stageId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = expandBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const result = await deps.treatmentProgram.expandLfkComplexIntoTemplateStageItems(
      parsed.data.templateId,
      stageId,
      parsed.data,
      {
        runTemplateWrite: (fn) =>
          withDoctorWorkspacePrincipal(
            workspace,
            'doctor.treatment-program-templates.stage-items.expand-lfk',
            fn,
          ),
      },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (isTreatmentProgramTemplateAlreadyArchivedError(e)) {
      return NextResponse.json({ ok: false, error: 'already_archived' }, { status: 400 });
    }
    // Статус выбирается по типу пойманной ошибки, а текст для врача — только помеченный автором.
    return respondWithSafeApiError(
      'api/doctor/treatment-program-templates/stages/[stageId]/items/from-lfk-complex',
      e,
      {
        fallbackCode: 'expand_lfk_complex_failed',
        fallbackStatus: 500,
        domainStatus: () => {
          if (isTreatmentProgramTemplateGroupDescriptionConflictError(e)) return 409;
          return isTreatmentProgramExpandNotFoundError(e) ? 404 : 400;
        },
      },
    );
  }
}
