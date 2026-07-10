/**
 * POST /api/doctor/messages/[conversationId]/read — отметить сообщения пользователя как прочитанные.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";

type WorkspaceConversationRef = {
  organizationId?: string | null;
  platformUserId?: string | null;
};

async function conversationBelongsToWorkspace(
  deps: ReturnType<typeof buildAppDeps>,
  conversation: WorkspaceConversationRef,
  organizationId: string,
): Promise<boolean> {
  if (conversation.organizationId) {
    return conversation.organizationId === organizationId;
  }
  if (!conversation.platformUserId) {
    return conversation.organizationId == null;
  }
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    conversation.platformUserId,
    organizationId,
  );
  return Boolean(identity);
}

async function claimLegacyConversationForWorkspace(
  deps: ReturnType<typeof buildAppDeps>,
  conversationId: string,
  conversation: WorkspaceConversationRef,
  organizationId: string,
): Promise<boolean> {
  if (conversation.organizationId != null) {
    return true;
  }
  return deps.supportCommunication.claimLegacyConversationForOrganization({
    conversationId,
    organizationId,
  });
}

export async function POST(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { conversationId } = await context.params;
  if (!conversationId?.trim() || !z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ ok: false, error: "invalid_param" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const full = await deps.supportCommunication.getConversationWithMessages(conversationId);
  if (!full || !(await conversationBelongsToWorkspace(deps, full.conversation, gate.ctx.organizationId))) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (
    !(await claimLegacyConversationForWorkspace(
      deps,
      conversationId,
      full.conversation,
      gate.ctx.organizationId,
    ))
  ) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.messaging.doctorSupport.markUserMessagesRead(conversationId),
  );
  return NextResponse.json({ ok: true });
}
