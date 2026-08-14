/**
 * POST /api/doctor/messages/[conversationId]/read — отметить сообщения пользователя как прочитанные.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';

type WorkspaceConversationRef = {
  organizationId?: string | null;
  platformUserId: string | null;
};

async function conversationBelongsToWorkspace(
  deps: ReturnType<typeof buildAppDeps>,
  conversation: WorkspaceConversationRef,
  organizationId: string,
  actor: PatientVisibilityActor,
): Promise<boolean> {
  if (conversation.organizationId !== organizationId) return false;
  if (actor.canManageAllSpecialists) return true;
  if (!conversation.platformUserId) return false;
  return Boolean(
    await deps.doctorClientsPort.getClientIdentityForOrganization(
      conversation.platformUserId,
      organizationId,
      actor,
    ),
  );
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { conversationId } = await context.params;
  if (!conversationId?.trim() || !z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_param' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const conversation = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.supportCommunication.getConversationRelayInfo(conversationId, gate.ctx.organizationId),
  );
  if (
    !conversation ||
    !(await conversationBelongsToWorkspace(
      deps,
      conversation,
      gate.ctx.organizationId,
      gate.ctx,
    ))
  ) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.messaging.doctorSupport.markUserMessagesRead(conversationId, gate.ctx.organizationId),
  );
  return NextResponse.json({ ok: true });
}
