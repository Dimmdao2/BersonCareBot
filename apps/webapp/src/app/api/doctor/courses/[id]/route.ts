import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireEntitlementForRead,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  isCourseArchiveNotFoundError,
  isCourseUsageConfirmationRequiredError,
} from '@/modules/courses/errors';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const courseStatusSchema = z.enum(['draft', 'published', 'archived']);

const patchBodySchema = z
  .object({
    title: z.string().min(1).max(2000).optional(),
    description: z.string().max(50000).optional().nullable(),
    programTemplateId: z.string().uuid().optional(),
    introLessonPageId: z.string().uuid().optional().nullable(),
    accessSettings: z.record(z.string(), z.unknown()).optional(),
    status: courseStatusSchema.optional(),
    priceMinor: z.number().int().min(0).optional(),
    currency: z.string().min(1).max(8).optional(),
    /** При переводе в `archived`: если нужно подтверждение usage — повторите PATCH с `true`. */
    acknowledgeUsageWarning: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).filter((k) => k !== 'acknowledgeUsageWarning').length > 0, {
    message: 'empty_patch',
  });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const entitlement = await requireEntitlementForRead(auth.ctx, 'courses');
  if (!entitlement.ok) return entitlement.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const item = await withDoctorWorkspacePrincipal(auth.ctx, 'doctor.courses.get', () =>
    deps.courses.getCourseForDoctor(id),
  );
  if (!item) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const entitlement = await requireEntitlementForMutation(auth.ctx, 'courses');
  if (!entitlement.ok) return entitlement.response;
  const { ctx: workspace } = auth;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const { acknowledgeUsageWarning, ...patch } = parsed.data;
  try {
    const source = patch.status === 'archived' ? 'doctor.courses.archive' : 'doctor.courses.update';
    const item = await withDoctorWorkspacePrincipal(workspace, source, () =>
      deps.courses.updateCourse(
        id,
        patch,
        { acknowledgeUsageWarning },
        {
          runCourseWrite: (fn) => withDoctorWorkspacePrincipal(workspace, source, fn),
        },
      ),
    );
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    if (isCourseUsageConfirmationRequiredError(e)) {
      return NextResponse.json({ ok: false, code: e.code, usage: e.usage }, { status: 409 });
    }
    if (isCourseArchiveNotFoundError(e)) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return respondWithSafeApiError('api/doctor/courses/[id]', e, {
      fallbackCode: 'course_update_failed',
      fallbackStatus: 500,
    });
  }
}
