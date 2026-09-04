import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const patchBodySchema = z.object({
  title: z.string().min(1).max(2000).optional(),
  description: z.string().max(20000).optional().nullable(),
  sortOrder: z.number().int().optional(),
  goals: z.string().max(200000).optional().nullable(),
  objectives: z.string().max(200000).optional().nullable(),
  expectedDurationDays: z.number().int().min(0).max(36500).optional().nullable(),
  expectedDurationText: z.string().max(20000).optional().nullable(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ stageId: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { stageId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const stage = await deps.treatmentProgram.updateStage(stageId, parsed.data, {
      runTemplateWrite: (fn) =>
        withDoctorWorkspacePrincipal(
          workspace,
          'doctor.treatment-program-templates.stages.update',
          fn,
        ),
    });
    return NextResponse.json({ ok: true, stage });
  } catch (e) {
    return respondWithSafeApiError('api/doctor/treatment-program-templates/stages/[stageId]', e, {
      fallbackCode: 'treatment_program_templates_stages_failed',
      fallbackStatus: 500,
      domainStatus: (text) => (text.includes('не найден') ? 404 : 400),
    });
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ stageId: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { stageId } = await ctx.params;
  const deps = buildAppDeps();
  try {
    await deps.treatmentProgram.deleteStage(stageId, {
      runTemplateWrite: (fn) =>
        withDoctorWorkspacePrincipal(
          workspace,
          'doctor.treatment-program-templates.stages.delete',
          fn,
        ),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondWithSafeApiError('api/doctor/treatment-program-templates/stages/[stageId]', e, {
      fallbackCode: 'treatment_program_templates_stages_failed',
      fallbackStatus: 500,
      domainStatus: 404,
    });
  }
}
