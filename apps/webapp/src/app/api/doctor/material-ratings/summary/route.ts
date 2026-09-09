import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const querySchema = z.object({
  kind: z.enum(['content_page', 'lfk_exercise', 'lfk_complex']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  const auth = await requireDoctorWorkspaceApiContext({
    workspaceModule:
      parsed.success && parsed.data.kind === 'content_page' ? undefined : 'rehabilitation',
  });
  if (!auth.ok) return auth.response;
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const audience = await loadDoctorAnalyticsAudience();
  const rows = await deps.materialRating.listDoctorSummary({
    organizationId: auth.ctx.organizationId,
    targetKind: parsed.data.kind,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    excludedUserIds: audience.excludedUserIds,
  });

  const contentIds = rows
    .filter((row) => row.targetKind === 'content_page')
    .map((row) => row.targetId);
  const exerciseIds = rows
    .filter((row) => row.targetKind === 'lfk_exercise')
    .map((row) => row.targetId);
  const templateIds = rows
    .filter((row) => row.targetKind === 'lfk_complex')
    .map((row) => row.targetId);
  const [contentMetas, exerciseTitles, templateTitles] = await Promise.all([
    deps.contentPages.listMetaByIds(contentIds),
    deps.lfkExercises.listExerciseTitlesByIds(exerciseIds, { includePlatformBase: false }),
    Promise.all(
      templateIds.map(async (id) => {
        const template = await deps.lfkTemplates.getTemplate(id, { includePlatformBase: false });
        return [id, template?.title ?? null] as const;
      }),
    ),
  ]);
  const contentTitles = new Map(contentMetas.map((meta) => [meta.id, meta.title]));
  const templateTitleMap = new Map(templateTitles);
  const enriched = rows.map((row) => ({
    ...row,
    label:
      row.targetKind === 'content_page'
        ? (contentTitles.get(row.targetId) ?? null)
        : row.targetKind === 'lfk_exercise'
          ? (exerciseTitles.get(row.targetId) ?? null)
          : (templateTitleMap.get(row.targetId) ?? null),
  }));

  return NextResponse.json({ ok: true, rows: enriched });
}
