import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  isTreatmentProgramExpandNotFoundError,
  isTreatmentProgramTemplateAlreadyArchivedError,
} from '@/modules/treatment-program/errors';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const bodySchema = z.object({
  templateId: z.string().uuid(),
  testSetId: z.string().uuid(),
});

export async function POST(request: Request, ctx: { params: Promise<{ stageId: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { stageId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const result = await deps.treatmentProgram.expandTestSetIntoTemplateStageItems(
      parsed.data.templateId,
      stageId,
      parsed.data.testSetId,
      {
        runTemplateWrite: (fn) =>
          withDoctorWorkspacePrincipal(
            workspace,
            'doctor.treatment-program-templates.stage-items.expand-test-set',
            fn,
          ),
      },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (isTreatmentProgramTemplateAlreadyArchivedError(e)) {
      return NextResponse.json({ ok: false, error: 'already_archived' }, { status: 400 });
    }
    return respondWithSafeApiError(
      'api/doctor/treatment-program-templates/stages/[stageId]/items/from-test-set',
      e,
      {
        fallbackCode: 'expand_test_set_failed',
        fallbackStatus: 500,
        domainStatus: () => (isTreatmentProgramExpandNotFoundError(e) ? 404 : 400),
      },
    );
  }
}
