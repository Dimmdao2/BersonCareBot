import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const postBodySchema = z.object({
  title: z.string().min(1).max(2000),
  description: z.string().max(20000).optional().nullable(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

const listQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export async function GET(request: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const items = await deps.treatmentProgram.listTemplates({
    includeArchived: parsed.data.includeArchived ?? false,
    status: parsed.data.status,
  });
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const row = await deps.treatmentProgram.createTemplate(
      {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        status: parsed.data.status,
      },
      workspace.session.user.userId,
      {
        runTemplateWrite: (fn) =>
          withDoctorWorkspacePrincipal(workspace, 'doctor.treatment-program-templates.create', fn),
      },
    );
    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    return respondWithSafeApiError('api/doctor/treatment-program-templates', e, {
      fallbackCode: 'doctor_treatment_program_templates_failed',
      fallbackStatus: 500,
    });
  }
}
