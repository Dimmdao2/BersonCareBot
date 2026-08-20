/**
 * GET /api/doctor/patients/[userId]/messages-snapshot
 * → { ok, conversationId?, messages, unreadFromUserCount }
 *
 * Read-only chat snapshot for the «Обзор» tab. Does not create conversations —
 * mutating ensure stays on explicit chat open / send paths.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { loadDoctorPatientMessagesSnapshot } from '@/app/app/doctor/patients/loadDoctorPatientMessagesSnapshot';
import { isSupportChatMessage } from '@/shared/lib/supportMessageKinds';
import { serializeSupportMessage } from '@/modules/messaging/serializeSupportMessage';

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const snapshot = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    loadDoctorPatientMessagesSnapshot(deps, identity.userId, gate.ctx.organizationId, gate.ctx),
  );

  return NextResponse.json({
    ok: true,
    conversationId: snapshot.conversationId ?? undefined,
    messages: snapshot.messages.filter(isSupportChatMessage).map(serializeSupportMessage),
    unreadFromUserCount: snapshot.unreadFromUserCount,
  });
}
