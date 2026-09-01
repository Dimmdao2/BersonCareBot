/**
 * GET /api/doctor/messages/conversations — открытые диалоги поддержки (projection).
 * Каждая строка обогащена полем `onSupport` (пациент на сопровождении).
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { doctorSupportUnreadOnlyFromQuery } from '@/modules/messaging/supportAdminListQuery';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';

export async function GET(request: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const deps = buildAppDeps();
  const url = new URL(request.url);
  const unreadOnly = doctorSupportUnreadOnlyFromQuery(url.searchParams.get('unread'));

  // Step 1: fetch conversations first to know which patient userIds we actually need.
  const list = await withDoctorWorkspacePrincipal(auth.ctx, () =>
    deps.messaging.doctorSupport.listOpenConversations({
      limit: 50,
      unreadOnly,
      organizationId: auth.ctx.organizationId,
      visibilityActor: auth.ctx,
    }),
  );

  const patientUserIds = Array.from(
    new Set(list.flatMap((conversation) => conversation.platformUserId ?? [])),
  );
  const scopedClients =
    patientUserIds.length > 0
      ? await withDoctorWorkspacePrincipal(auth.ctx, () =>
          deps.doctorClients.listClients({
            userIds: patientUserIds,
            organizationId: auth.ctx.organizationId,
            visibilityActor: auth.ctx,
          }),
        )
      : [];
  const clientInfoMap = new Map(
    scopedClients.map((client) => [
      client.userId,
      {
        firstName: client.firstName ?? null,
        lastName: client.lastName ?? null,
        isOnSupport: client.isOnSupport ?? false,
      },
    ]),
  );

  return NextResponse.json({
    ok: true,
    conversations: list.map((c) => {
      const clientInfo = c.platformUserId ? clientInfoMap.get(c.platformUserId) : null;
      return {
        conversationId: c.conversationId,
        integratorConversationId: c.integratorConversationId,
        source: c.source,
        status: c.status,
        openedAt: c.openedAt,
        lastMessageAt: c.lastMessageAt,
        displayName: c.displayName,
        firstName: clientInfo?.firstName ?? c.firstName,
        lastName: clientInfo?.lastName ?? c.lastName,
        phoneNormalized: c.phoneNormalized,
        lastMessageText: c.lastMessageText,
        lastSenderRole: c.lastSenderRole,
        unreadFromUserCount: c.unreadFromUserCount,
        hasUnreadFromUser: c.unreadFromUserCount > 0,
        onSupport: clientInfo?.isOnSupport ?? false,
        // #813: already derived above (no extra query) — lets the chat header link to the
        // patient's card. null for non-webapp-platform conversations (e.g. Telegram/MAX).
        patientUserId: c.platformUserId,
      };
    }),
  });
}
