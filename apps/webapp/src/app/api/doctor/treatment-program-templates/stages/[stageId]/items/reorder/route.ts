import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const postBodySchema = z.object({
  orderedItemIds: z.array(z.string().uuid()).min(1),
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
    await deps.treatmentProgram.reorderTemplateStageItems(stageId, parsed.data.orderedItemIds, {
      runTemplateWrite: (fn) =>
        withDoctorWorkspacePrincipal(
          workspace,
          'doctor.treatment-program-templates.stage-items.reorder',
          fn,
        ),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-templates/stages/[stageId]/items/reorder',
      e,
      {
        fallbackCode: 'items_reorder_failed',
        fallbackStatus: 500,
      },
    );
  }
}
