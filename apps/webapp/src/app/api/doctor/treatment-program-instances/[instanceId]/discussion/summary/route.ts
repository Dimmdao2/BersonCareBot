import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { exerciseTitleFromSnapshot } from '@/modules/messaging/programNoteReplyContext';
import { getDiscussionSummaryForItem } from '@/modules/program-item-discussion/listDiscussionPage';
import { resolveDoctorInstanceInWorkspace } from '../../../_doctorInstanceWorkspace';

function parseRequestedStageItemIds(raw: string | null): string[] | null {
  if (raw == null || raw.trim() === '') return null;
  const chunks = raw
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  if (chunks.length === 0) return null;
  return chunks;
}

export async function GET(request: Request, context: { params: Promise<{ instanceId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const resolved = await resolveDoctorInstanceInWorkspace(deps, gate.ctx, instanceId, {
    requireDoctorAssigned: true,
  });
  if (!resolved.ok) return resolved.response;
  const { instance } = resolved;

  const allItems = instance.stages.flatMap((stage) => stage.items);
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const requested = parseRequestedStageItemIds(
    new URL(request.url).searchParams.get('stageItemIds'),
  );
  const stageItemIds = requested ?? allItems.map((item) => item.id);

  for (const id of stageItemIds) {
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ ok: false, error: 'invalid_stage_item_id' }, { status: 400 });
    }
    if (!byId.has(id)) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
  }

  const summaryByStageItemIdEntries = await Promise.all(
    stageItemIds.map(async (stageItemId) => {
      const item = byId.get(stageItemId)!;
      const summary = await withDoctorWorkspacePrincipal(gate.ctx, () =>
        getDiscussionSummaryForItem({
          discussion: deps.programItemDiscussion,
          stageItemId,
          patientUserId: instance.patientUserId,
          exerciseTitle: exerciseTitleFromSnapshot(item.snapshot),
        }),
      );
      return [stageItemId, summary] as const;
    }),
  );

  return NextResponse.json({
    ok: true,
    summaryByStageItemId: Object.fromEntries(summaryByStageItemIdEntries),
  });
}
