import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const patchBodySchema = z.object({
  title: z.string().min(1).max(2000).optional(),
  description: z.string().max(10000).optional().nullable(),
  scheduleText: z.string().max(5000).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { groupId } = await ctx.params;
  if (!z.string().uuid().safeParse(groupId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const group = await deps.treatmentProgram.updateTemplateStageGroup(groupId, parsed.data, {
      runTemplateWrite: (fn) =>
        withDoctorWorkspacePrincipal(
          workspace,
          'doctor.treatment-program-templates.stage-groups.update',
          fn,
        ),
    });
    return NextResponse.json({ ok: true, group });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-templates/stage-groups/[groupId]',
      e,
      {
        fallbackCode: 'treatment_program_templates_stage_groups_failed',
        fallbackStatus: 500,
        domainStatus: (text) => (text.includes('не найден') ? 404 : 400),
      },
    );
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { groupId } = await ctx.params;
  if (!z.string().uuid().safeParse(groupId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    await deps.treatmentProgram.deleteTemplateStageGroup(groupId, {
      runTemplateWrite: (fn) =>
        withDoctorWorkspacePrincipal(
          workspace,
          'doctor.treatment-program-templates.stage-groups.delete',
          fn,
        ),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-templates/stage-groups/[groupId]',
      e,
      {
        fallbackCode: 'treatment_program_templates_stage_groups_failed',
        fallbackStatus: 500,
        domainStatus: 404,
      },
    );
  }
}
