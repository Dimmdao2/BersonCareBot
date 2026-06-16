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

  const [list, allClients] = await Promise.all([
    deps.messaging.doctorSupport.listOpenConversations({ limit: 50, unreadOnly }),
    deps.doctorClients.listClients({}),
  ]);

  // Build userId → { firstName, lastName, isOnSupport } map from the full client list.
  // listClients({}) always populates isOnSupport for every row (joined from doctor_patient_support).
  const clientInfoMap = new Map<string, { firstName: string | null; lastName: string | null; isOnSupport: boolean }>();
  for (const c of allClients) {
    clientInfoMap.set(c.userId, {
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      isOnSupport: c.isOnSupport ?? false,
    });
  }

  return NextResponse.json({
    ok: true,
    conversations: list.map((c) => {
      const patientUserId = parsePlatformUserIdFromWebappConversationId(
        c.integratorConversationId,
      );
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
      };
    }),
  });
}
