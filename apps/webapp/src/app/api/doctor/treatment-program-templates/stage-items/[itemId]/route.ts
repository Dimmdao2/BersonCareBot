import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { TREATMENT_PROGRAM_ITEM_TYPES } from '@/modules/treatment-program/types';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const patchBodySchema = z.object({
  itemType: z.enum(TREATMENT_PROGRAM_ITEM_TYPES).optional(),
  itemRefId: z.string().uuid().optional(),
  sortOrder: z.number().int().optional(),
  comment: z.string().max(5000).optional().nullable(),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  /** Группа этапа; `null` — вне групп. */
  groupId: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { itemId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const item = await deps.treatmentProgram.updateStageItem(itemId, parsed.data, {
      runTemplateWrite: (fn) =>
        withDoctorWorkspacePrincipal(
          workspace,
          'doctor.treatment-program-templates.stage-items.update',
          fn,
        ),
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-templates/stage-items/[itemId]',
      e,
      {
        fallbackCode: 'treatment_program_templates_stage_items_failed',
        fallbackStatus: 500,
        domainStatus: (text) => (text.includes('не найден') ? 404 : 400),
      },
    );
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { itemId } = await ctx.params;
  const deps = buildAppDeps();
  try {
    await deps.treatmentProgram.deleteStageItem(itemId, {
      runTemplateWrite: (fn) =>
        withDoctorWorkspacePrincipal(
          workspace,
          'doctor.treatment-program-templates.stage-items.delete',
          fn,
        ),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-templates/stage-items/[itemId]',
      e,
      {
        fallbackCode: 'treatment_program_templates_stage_items_failed',
        fallbackStatus: 500,
        domainStatus: 404,
      },
    );
  }
}
