/**
 * GET /api/patient/messages — bootstrap (без query) или сообщения по `conversationId` (+ опционально `since` для polling).
 * POST /api/patient/messages — отправка текста в свой диалог (`conversationId` + `text`).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePatientApiSessionWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { serializeSupportMessage } from "@/modules/messaging/serializeSupportMessage";

const postBodySchema = z.object({
  text: z.string().min(1).max(4000),
  conversationId: z.string().uuid(),
});

export async function GET(request: Request) {
  const gate = await requirePatientApiSessionWithPhone({ returnPath: routePaths.patientMessages });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const conversationIdRaw = typeof raw.conversationId === "string" ? raw.conversationId.trim() : "";
  const sinceRaw = typeof raw.since === "string" ? raw.since.trim() : "";
  const conversationId = conversationIdRaw || undefined;
  const since = sinceRaw || undefined;
  if (conversationId && !z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }
  const deps = buildAppDeps();
  const userId = session.user.userId;

  if (!conversationId) {
    const boot = await deps.messaging.patient.bootstrap(userId);
    const unreadCount = await deps.messaging.patient.unreadCount(userId);
    return NextResponse.json({
      ok: true,
      conversationId: boot.conversationId,
      messages: boot.messages.map(serializeSupportMessage),
      unreadCount,
    });
  }

  const polled = await deps.messaging.patient.pollNew(userId, conversationId, since ?? null);
  if (!polled) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    conversationId,
    messages: polled.messages.map(serializeSupportMessage),
  });
}

export async function POST(request: Request) {
  const gate = await requirePatientApiSessionWithPhone({ returnPath: routePaths.patientMessages });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const userId = session.user.userId;
  const result = await deps.messaging.patient.sendText(userId, parsed.data.conversationId, parsed.data.text);
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (result.error === "blocked") {
      return NextResponse.json({ ok: false, error: "blocked" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
