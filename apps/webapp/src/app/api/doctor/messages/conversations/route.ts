/**
 * GET /api/doctor/messages/conversations — открытые диалоги поддержки (projection).
 * Каждая строка обогащена полем `onSupport` (пациент на сопровождении).
 */
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { doctorSupportUnreadOnlyFromQuery } from "@/modules/messaging/supportAdminListQuery";
import { parsePlatformUserIdFromWebappConversationId } from "@/modules/messaging/supportConversationIds";
import { canAccessDoctor } from "@/modules/roles/service";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const deps = buildAppDeps();
  const url = new URL(request.url);
  const unreadOnly = doctorSupportUnreadOnlyFromQuery(url.searchParams.get("unread"));

  const [list, onSupportClients] = await Promise.all([
    deps.messaging.doctorSupport.listOpenConversations({ limit: 50, unreadOnly }),
    deps.doctorClients.listClients({ supportStatus: "on" }),
  ]);
  const onSupportIds = new Set(onSupportClients.map((c) => c.userId));

  return NextResponse.json({
    ok: true,
    conversations: list.map((c) => {
      const patientUserId = parsePlatformUserIdFromWebappConversationId(
        c.integratorConversationId,
      );
      const onSupport = patientUserId != null && onSupportIds.has(patientUserId);
      return {
        conversationId: c.conversationId,
        integratorConversationId: c.integratorConversationId,
        source: c.source,
        status: c.status,
        openedAt: c.openedAt,
        lastMessageAt: c.lastMessageAt,
        displayName: c.displayName,
        phoneNormalized: c.phoneNormalized,
        lastMessageText: c.lastMessageText,
        lastSenderRole: c.lastSenderRole,
        unreadFromUserCount: c.unreadFromUserCount,
        hasUnreadFromUser: c.unreadFromUserCount > 0,
        onSupport,
      };
    }),
  });
}
