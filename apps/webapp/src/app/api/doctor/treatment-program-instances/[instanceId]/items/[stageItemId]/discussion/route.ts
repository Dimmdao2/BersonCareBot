import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { exerciseTitleFromSnapshot } from '@/modules/messaging/programNoteReplyContext';
import { listDiscussionPageMerged } from '@/modules/program-item-discussion/listDiscussionPage';
import { effectiveInstanceStageItemComment } from '@/modules/treatment-program/types';
import { resolveDoctorInstanceInWorkspace } from '../../../../_doctorInstanceWorkspace';

const directionSchema = z.enum(['backward', 'forward']);

const cursorPayloadSchema = z.object({
  createdAt: z.string().min(1),
  id: z.string().min(1),
});

function decodeCursor(raw: string): z.infer<typeof cursorPayloadSchema> | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;
    const validated = cursorPayloadSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function normalizeLimit(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return 30;
  if (!/^\d+$/.test(raw.trim())) return null;
  return Math.min(100, Math.max(1, Number.parseInt(raw, 10)));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ instanceId: string; stageItemId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { instanceId, stageItemId } = await context.params;
  if (
    !z.string().uuid().safeParse(instanceId).success ||
    !z.string().uuid().safeParse(stageItemId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const limit = normalizeLimit(url.searchParams.get('limit'));
  if (limit == null) {
    return NextResponse.json({ ok: false, error: 'invalid_limit' }, { status: 400 });
  }

  const directionParsed = directionSchema.safeParse(
    url.searchParams.get('direction') ?? 'backward',
  );
  if (!directionParsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_direction' }, { status: 400 });
  }
  const direction = directionParsed.data;

  const rawCursor = url.searchParams.get('cursor');
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) {
    return NextResponse.json({ ok: false, error: 'invalid_cursor' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const resolved = await resolveDoctorInstanceInWorkspace(deps, gate.ctx, instanceId, {
      requireDoctorAssigned: true,
    });
    if (!resolved.ok) return resolved.response;
    const { instance } = resolved;

    const item = instance.stages.flatMap((s) => s.items).find((x) => x.id === stageItemId) ?? null;
    if (!item) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

    const pageResult = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      listDiscussionPageMerged({
        discussion: deps.programItemDiscussion,
        stageItemId,
        patientUserId: instance.patientUserId,
        exerciseTitle: exerciseTitleFromSnapshot(item.snapshot),
        limit,
        direction,
        cursor,
      }),
    );

    const { page, nextCursor, hasMore, totalCount } = pageResult;

    const peerLastReadAt = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.programItemDiscussion.getLastReadAtForViewer({
        viewerUserId: instance.patientUserId,
        stageItemId,
      }),
    );

    return NextResponse.json({
      ok: true,
      messages: page,
      pageInfo: {
        direction,
        limit,
        nextCursor,
        hasMore,
      },
      totalCount,
      peerLastReadAt,
      itemContext: {
        patientUserId: instance.patientUserId,
        itemType: item.itemType,
        settings: item.settings,
        snapshot: item.snapshot,
        effectiveComment: effectiveInstanceStageItemComment(item),
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
}
