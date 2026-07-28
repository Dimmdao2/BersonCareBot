import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';

export async function POST(
  _request: Request,
  context: { params: Promise<{ instanceId: string; stageItemId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { instanceId, stageItemId } = await context.params;
  if (
    !z.string().uuid().safeParse(instanceId).success ||
    !z.string().uuid().safeParse(stageItemId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const instance = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    if (!instance || instance.organizationId !== gate.ctx.organizationId)
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

    const hasItem = instance.stages.some((stage) =>
      stage.items.some((item) => item.id === stageItemId),
    );
    if (!hasItem) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

    await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.programItemDiscussion.markReadForViewer({
        viewerUserId: session.user.userId,
        stageItemId,
        lastReadAt: new Date().toISOString(),
      }),
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
}
