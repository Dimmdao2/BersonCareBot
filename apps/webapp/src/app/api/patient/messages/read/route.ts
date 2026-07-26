/**
 * POST /api/patient/messages/read — отметить входящие от админа как прочитанные для текущего пользователя.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
});

export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientMessages });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const userId = session.user.userId;
  const conv = await deps.supportCommunication.getConversationIfOwnedByUser(parsed.data.conversationId, userId);
  // Единственная причина 404 — обращение принадлежит кому-то другому: один и тот же ответ на объект,
  // прав на который нет (OWASP ASVS 5.0 V8.2.2, object-level authorization; CWE-639).
  // СВОЁ ЗАКРЫТОЕ обращение сюда НЕ добавлять: оно видно пациенту, значит квитанция «прочитано» по
  // нему — успешная операция (в пределе no-op), а не ошибка. Решение владельца 2026-07-26.
  if (!conv) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const organizationId = conv.organizationId?.trim();
  const [discussionUiEnabled, unreadInbound] = await Promise.all([
    organizationId
      ? deps.runtimeConfig.getBoolean("patient_program_discussion_ui_enabled", {
          patientUserId: userId,
          organizationId,
        })
      : Promise.resolve(false),
    deps.supportCommunication.listUnreadInboundAdminMessagesForUser(userId),
  ]);
  if (discussionUiEnabled && unreadInbound.length > 0) {
    await deps.programItemDiscussion.syncDiscussionReadFromSupportInboundMessages({
      patientUserId: userId,
      inboundAdminMessages: unreadInbound,
    });
  }

  await deps.messaging.patient.markInboundRead(userId, parsed.data.conversationId);
  return NextResponse.json({ ok: true });
}
