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
  if (!conv) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  await deps.messaging.patient.markInboundRead(userId, parsed.data.conversationId);
  return NextResponse.json({ ok: true });
}
