import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const entitlement = await requireEntitlementForRead(auth.ctx, 'courses');
  if (!entitlement.ok) return entitlement.response;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const usage = await withDoctorWorkspacePrincipal(auth.ctx, 'doctor.courses.usage', () =>
      deps.courses.getCourseUsage(id),
    );
    return NextResponse.json({ ok: true, usage });
  } catch {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
}
