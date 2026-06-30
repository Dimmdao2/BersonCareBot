/**
 * POST /api/doctor/online-intake/[id]/reply
 *
 * Sends a free-text reply to the patient's support chat conversation.
 * If the intake is still "new", auto-transitions to "in_review".
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const { id } = await params;
  const intakeService = getOnlineIntakeService();
  const intake = await intakeService.getRequestForDoctor(id);
  if (!intake) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const deps = buildAppDeps();

  const { conversationId } = await deps.messaging.doctorSupport.ensureConversationForPatient(
    intake.userId,
  );

  const result = await deps.messaging.doctorSupport.sendAdminReply(
    conversationId,
    parsed.data.text,
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  // Auto-advance "new" → "in_review" on first reply.
  // Best-effort: если переход упадёт — сообщение уже ушло пациенту, поэтому
  // логируем ошибку и возвращаем ok:true. Врач может поменять статус вручную.
  if (intake.status === "new") {
    try {
      await intakeService.changeStatus({
        requestId: id,
        changedBy: session.user.userId,
        toStatus: "in_review",
        note: "Автоматически при первом ответе",
      });
    } catch (err) {
      console.error("[reply-route] auto-transition new→in_review failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
