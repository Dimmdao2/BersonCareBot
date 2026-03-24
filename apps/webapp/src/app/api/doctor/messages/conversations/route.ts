/**
 * GET /api/doctor/messages/conversations — открытые диалоги поддержки (projection).
 */
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const deps = buildAppDeps();
  const list = await deps.messaging.doctorSupport.listOpenConversations({ limit: 50 });
  return NextResponse.json({
    ok: true,
    conversations: list.map((c) => ({
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
    })),
  });
}
