import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireEntitlementForRead,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';

const courseStatusSchema = z.enum(['draft', 'published', 'archived']);

const listQuerySchema = z.object({
  status: courseStatusSchema.optional(),
  includeArchived: z.coerce.boolean().optional(),
});

const postBodySchema = z.object({
  title: z.string().min(1).max(2000),
  description: z.string().max(50000).optional().nullable(),
  programTemplateId: z.string().uuid(),
  introLessonPageId: z.string().uuid().optional().nullable(),
  accessSettings: z.record(z.string(), z.unknown()).optional(),
  status: courseStatusSchema.optional(),
  priceMinor: z.number().int().min(0).optional(),
  currency: z.string().min(1).max(8).optional(),
});

export async function GET(request: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const entitlement = await requireEntitlementForRead(auth.ctx, 'courses');
  if (!entitlement.ok) return entitlement.response;

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const items = await withDoctorWorkspacePrincipal(auth.ctx, 'doctor.courses.list', () =>
    deps.courses.listCoursesForDoctor({
      status: parsed.data.status ?? null,
      includeArchived: parsed.data.includeArchived ?? false,
    }),
  );
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const workspace = auth.ctx;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const entitlement = await requireEntitlementForMutation(auth.ctx, 'courses');
  if (!entitlement.ok) return entitlement.response;

  const deps = buildAppDeps();
  try {
    const item = await withDoctorWorkspacePrincipal(workspace, 'doctor.courses.create', () =>
      deps.courses.createCourse(
        {
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          programTemplateId: parsed.data.programTemplateId,
          introLessonPageId: parsed.data.introLessonPageId ?? null,
          accessSettings: parsed.data.accessSettings ?? {},
          status: parsed.data.status,
          priceMinor: parsed.data.priceMinor,
          currency: parsed.data.currency,
        },
        {
          runCourseWrite: (fn) =>
            withDoctorWorkspacePrincipal(workspace, 'doctor.courses.create', fn),
        },
      ),
    );
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
