import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';

const bodySchema = z.object({ targetMessageId: z.string().uuid() });

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

async function resolveVisibleConversation(
  conversationId: string,
  gate: Extract<Awaited<ReturnType<typeof requireDoctorWorkspaceApiContext>>, { ok: true }>,
) {
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
    )) ||
    !(await deps.doctorClients.getClientChannelPolicy(conversation.platformUserId, {
      organizationId: gate.ctx.organizationId,
    })).directChatAllowed
  ) {
    return null;
  }
  return deps;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { conversationId } = await context.params;
  if (!z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_param' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const deps = await resolveVisibleConversation(conversationId, gate);
  if (!deps) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const marked = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.messaging.doctorSupport.setManualUnreadMarker({
      conversationId,
      targetMessageId: parsed.data.targetMessageId,
      organizationId: gate.ctx.organizationId,
      staffUserId: gate.ctx.session.user.userId,
    }),
  );
  if (!marked) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, targetMessageId: parsed.data.targetMessageId });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { conversationId } = await context.params;
  if (!z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_param' }, { status: 400 });
  }
  const deps = await resolveVisibleConversation(conversationId, gate);
  if (!deps) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.messaging.doctorSupport.clearManualUnreadMarker({
      conversationId,
      organizationId: gate.ctx.organizationId,
      staffUserId: gate.ctx.session.user.userId,
    }),
  );
  return NextResponse.json({ ok: true });
}
