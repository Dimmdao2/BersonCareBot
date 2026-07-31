import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import {
  entitlementMutationRefusalResponse,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { testSetListFilterFromDoctorApiGetQuery } from '@/shared/lib/doctorCatalogListStatus';

const postBodySchema = z.object({
  title: z.string().min(1).max(2000),
  description: z.string().max(20000).nullable().optional(),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  /** @deprecated Предпочтительнее `arch` + `publicationScope`. */
  includeArchived: z.coerce.boolean().optional(),
  arch: z.enum(['active', 'archived']).optional(),
  publicationScope: z.enum(['all', 'draft', 'published']).optional(),
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
  const items = await deps.testSets.listTestSets(
    testSetListFilterFromDoctorApiGetQuery(parsed.data),
  );
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;
  const { ctx: workspace } = auth;

  const entitlement = await requireEntitlementForMutation(workspace, 'clinical_tests');
  if (!entitlement.ok) {
    return entitlementMutationRefusalResponse('clinical_tests', 'создать набор тестов');
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const row = await deps.testSets.createTestSet(
      {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
      },
      workspace.session.user.userId,
      {
        runTestSetWrite: (fn) =>
          withDoctorWorkspacePrincipal(workspace, 'doctor.test-sets.create', fn),
      },
    );
    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
