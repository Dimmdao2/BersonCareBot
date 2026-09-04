import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { TREATMENT_PROGRAM_ITEM_TYPES } from '@/modules/treatment-program/types';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const postBodySchema = z.object({
  itemType: z.enum(TREATMENT_PROGRAM_ITEM_TYPES),
  itemRefId: z.string().uuid(),
  sortOrder: z.number().int().optional(),
  comment: z.string().max(5000).optional().nullable(),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  groupId: z.string().uuid().optional().nullable(),
});

export async function POST(request: Request, ctx: { params: Promise<{ stageId: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { stageId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const item = await deps.treatmentProgram.addStageItem(
      stageId,
      {
        itemType: parsed.data.itemType,
        itemRefId: parsed.data.itemRefId,
        sortOrder: parsed.data.sortOrder,
        comment: parsed.data.comment ?? null,
        settings: parsed.data.settings ?? null,
        groupId: parsed.data.groupId ?? undefined,
      },
      {
        runTemplateWrite: (fn) =>
          withDoctorWorkspacePrincipal(
            workspace,
            'doctor.treatment-program-templates.stage-items.create',
            fn,
          ),
      },
    );
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-templates/stages/[stageId]/items',
      e,
      {
        fallbackCode: 'stages_items_failed',
        fallbackStatus: 500,
      },
    );
  }
}
