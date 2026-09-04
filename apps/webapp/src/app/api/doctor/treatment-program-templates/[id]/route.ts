import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  isTreatmentProgramTemplateAlreadyArchivedError,
  isTreatmentProgramTemplateArchiveNotFoundError,
  isTreatmentProgramTemplateUsageConfirmationRequiredError,
} from '@/modules/treatment-program/errors';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const patchBodySchema = z.object({
  title: z.string().min(1).max(2000).optional(),
  description: z.string().max(20000).optional().nullable(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  acknowledgeUsageWarning: z.boolean().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const deps = buildAppDeps();
  try {
    const item = await deps.treatmentProgram.getTemplate(id);
    return NextResponse.json({ ok: true, item });
  } catch {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { id } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const { acknowledgeUsageWarning, ...patch } = parsed.data;
  try {
    const source =
      patch.status === 'archived'
        ? 'doctor.treatment-program-templates.archive'
        : 'doctor.treatment-program-templates.update';
    const row = await deps.treatmentProgram.updateTemplate(
      id,
      patch,
      { acknowledgeUsageWarning },
      {
        runTemplateWrite: (fn) => withDoctorWorkspacePrincipal(workspace, source, fn),
      },
    );
    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    if (isTreatmentProgramTemplateUsageConfirmationRequiredError(e)) {
      return NextResponse.json({ ok: false, code: e.code, usage: e.usage }, { status: 409 });
    }
    if (isTreatmentProgramTemplateArchiveNotFoundError(e)) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return respondWithSafeApiError('api/doctor/treatment-program-templates/[id]', e, {
      fallbackCode: 'treatment_program_template_update_failed',
      fallbackStatus: 500,
      domainStatus: (text) => (text.includes('не найден') ? 404 : 400),
    });
  }
}

/** Архивация (DELETE): при необходимости подтверждения usage — 409; повтор с `?acknowledgeUsageWarning=1`. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { id } = await ctx.params;
  const url = new URL(request.url);
  const ack = url.searchParams.get('acknowledgeUsageWarning');
  const acknowledgeUsageWarning = ack === '1' || ack === 'true' || ack === 'on';

  const deps = buildAppDeps();
  try {
    await deps.treatmentProgram.deleteTemplate(
      id,
      { acknowledgeUsageWarning },
      {
        runTemplateWrite: (fn) =>
          withDoctorWorkspacePrincipal(workspace, 'doctor.treatment-program-templates.archive', fn),
      },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isTreatmentProgramTemplateUsageConfirmationRequiredError(e)) {
      return NextResponse.json({ ok: false, code: e.code, usage: e.usage }, { status: 409 });
    }
    if (isTreatmentProgramTemplateAlreadyArchivedError(e)) {
      return NextResponse.json({ ok: false, error: 'already_archived' }, { status: 400 });
    }
    if (isTreatmentProgramTemplateArchiveNotFoundError(e)) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: 'archive_failed' }, { status: 400 });
  }
}
