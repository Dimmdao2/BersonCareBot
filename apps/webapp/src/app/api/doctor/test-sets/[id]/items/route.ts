import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';

const putBodySchema = z.object({
  items: z.array(
    z.object({
      testId: z.string().uuid(),
      sortOrder: z.number().int(),
      comment: z.string().max(10000).nullable().optional(),
    }),
  ),
});

/** PUT replaces the entire ordered list of tests in the set (CRUD для test_set_items). */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const { id } = await ctx.params;
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = putBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    await deps.testSets.setTestSetItems(id, parsed.data.items, {
      runTestSetWrite: (fn) =>
        withDoctorWorkspacePrincipal(workspace, 'doctor.test-sets.items.update', fn),
    });
    const item = await deps.testSets.getTestSet(id);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    const status = msg.includes('не найден') ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
