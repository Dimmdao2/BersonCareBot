/**
 * POST /api/doctor/messages/[conversationId]/read — отметить сообщения пользователя как прочитанные.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

export async function POST(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { conversationId } = await context.params;
  if (!conversationId?.trim() || !z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ ok: false, error: "invalid_param" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const full = await deps.supportCommunication.getConversationWithMessages(conversationId);
  if (!full) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  await deps.messaging.doctorSupport.markUserMessagesRead(conversationId);
  return NextResponse.json({ ok: true });
}
