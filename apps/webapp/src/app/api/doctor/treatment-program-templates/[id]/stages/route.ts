import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const postBodySchema = z.object({
  title: z.string().min(1).max(2000),
  description: z.string().max(20000).optional().nullable(),
  goals: z.string().max(200000).optional().nullable(),
  objectives: z.string().max(200000).optional().nullable(),
  expectedDurationDays: z.number().int().min(0).max(36500).optional().nullable(),
  expectedDurationText: z.string().max(20000).optional().nullable(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { id: templateId } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const stage = await deps.treatmentProgram.createStage(
      templateId,
      {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        goals: parsed.data.goals,
        objectives: parsed.data.objectives,
        expectedDurationDays: parsed.data.expectedDurationDays,
        expectedDurationText: parsed.data.expectedDurationText,
      },
      {
        runTemplateWrite: (fn) =>
          withDoctorWorkspacePrincipal(
            workspace,
            'doctor.treatment-program-templates.stages.create',
            fn,
          ),
      },
    );
    return NextResponse.json({ ok: true, stage });
  } catch (e) {
    return respondWithSafeApiError('api/doctor/treatment-program-templates/[id]/stages', e, {
      fallbackCode: 'treatment_program_templates_stages_failed',
      fallbackStatus: 500,
    });
  }
}
