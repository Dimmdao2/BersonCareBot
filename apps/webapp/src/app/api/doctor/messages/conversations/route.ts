/**
 * GET /api/doctor/messages/conversations — открытые диалоги поддержки (projection).
 * Каждая строка обогащена полем `onSupport` (пациент на сопровождении).
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { doctorSupportUnreadOnlyFromQuery } from '@/modules/messaging/supportAdminListQuery';
import { parsePlatformUserIdFromWebappConversationId } from '@/modules/messaging/supportConversationIds';
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

  // Step 2: extract unique patient userIds from the conversation list.
  const patientUserIds = Array.from(
    new Set(
      list.flatMap((c) => {
        const uid = parsePlatformUserIdFromWebappConversationId(c.integratorConversationId);
        return uid ? [uid] : [];
      }),
    ),
  );

  // Step 3: look up only the specific clients we need (≤50), not the full patient list.
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

  // Build userId → { firstName, lastName, isOnSupport } map.
  const clientInfoMap = new Map<
    string,
    { firstName: string | null; lastName: string | null; isOnSupport: boolean }
  >();
  for (const c of scopedClients) {
    clientInfoMap.set(c.userId, {
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      isOnSupport: c.isOnSupport ?? false,
    });
  }

  return NextResponse.json({
    ok: true,
    conversations: list.map((c) => {
      const patientUserId = parsePlatformUserIdFromWebappConversationId(c.integratorConversationId);
      const clientInfo = patientUserId ? clientInfoMap.get(patientUserId) : null;
      return {
        conversationId: c.conversationId,
        integratorConversationId: c.integratorConversationId,
        source: c.source,
        status: c.status,
        openedAt: c.openedAt,
        lastMessageAt: c.lastMessageAt,
        displayName: c.displayName,
        firstName: clientInfo?.firstName ?? null,
        lastName: clientInfo?.lastName ?? null,
        phoneNormalized: c.phoneNormalized,
        lastMessageText: c.lastMessageText,
        lastSenderRole: c.lastSenderRole,
        unreadFromUserCount: c.unreadFromUserCount,
        hasUnreadFromUser: c.unreadFromUserCount > 0,
        onSupport: clientInfo?.isOnSupport ?? false,
        // #813: already derived above (no extra query) — lets the chat header link to the
        // patient's card. null for non-webapp-platform conversations (e.g. Telegram/MAX).
        patientUserId: patientUserId ?? null,
      };
    }),
  });
}
