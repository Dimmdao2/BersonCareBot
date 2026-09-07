/**
 * GET /api/doctor/messages/unread-count — непрочитанные сообщения от пользователей (роль user):
 * - глобально;
 * - или для конкретного пациента (`?patientUserId=<uuid>`).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

const patientUserIdSchema = z.string().uuid();

export async function GET(request: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const deps = buildAppDeps();
  const url = new URL(request.url);
  const patientUserIdRaw = url.searchParams.get('patientUserId');
  const patientUserId = patientUserIdRaw?.trim() ? patientUserIdRaw.trim() : null;

  let unreadCount: number;
  if (patientUserId) {
    if (!patientUserIdSchema.safeParse(patientUserId).success) {
      return NextResponse.json({ ok: false, error: 'invalid_patient_user_id' }, { status: 400 });
    }
    const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
      patientUserId,
      auth.ctx.organizationId,
      auth.ctx,
    );
    if (!identity) {
      return NextResponse.json({ ok: false, error: 'patient_not_found' }, { status: 404 });
    }
    unreadCount = (await deps.doctorClients.getClientChannelPolicy(identity.userId, {
      organizationId: auth.ctx.organizationId,
    })).directChatAllowed
      ? await deps.messaging.doctorSupport.unreadFromPatient(
          patientUserId,
          auth.ctx.organizationId,
        )
      : 0;
  } else {
    const conversations = await deps.messaging.doctorSupport.listOpenConversations({
      limit: 100,
      unreadOnly: true,
      organizationId: auth.ctx.organizationId,
      visibilityActor: auth.ctx,
    });
    const patientUserIds = conversations.flatMap((conversation) =>
      conversation.platformUserId ? [conversation.platformUserId] : [],
    );
    const allowed = await deps.doctorClients.filterPatientUserIdsByClientChannel(
      patientUserIds,
      { organizationId: auth.ctx.organizationId },
      'directChatAllowed',
    );
    unreadCount = conversations.reduce(
      (sum, conversation) =>
        conversation.platformUserId && allowed.has(conversation.platformUserId)
          ? sum + conversation.unreadFromUserCount
          : sum,
      0,
    );
  }
  return NextResponse.json({ ok: true, unreadCount });
}
