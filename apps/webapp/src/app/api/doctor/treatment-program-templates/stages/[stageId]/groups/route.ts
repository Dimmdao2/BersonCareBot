import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const postBodySchema = z.object({
  title: z.string().min(1).max(2000),
  description: z.string().max(10000).optional().nullable(),
  scheduleText: z.string().max(5000).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ stageId: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { stageId } = await ctx.params;
  if (!z.string().uuid().safeParse(stageId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const group = await deps.treatmentProgram.createTemplateStageGroup(stageId, parsed.data, {
      runTemplateWrite: (fn) =>
        withDoctorWorkspacePrincipal(
          workspace,
          'doctor.treatment-program-templates.stage-groups.create',
          fn,
        ),
    });
    return NextResponse.json({ ok: true, group });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-templates/stages/[stageId]/groups',
      e,
      {
        fallbackCode: 'stages_groups_failed',
        fallbackStatus: 500,
      },
    );
  }
}
