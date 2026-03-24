/**
 * GET /api/doctor/messages/[conversationId] — сообщения (опционально `since` для polling).
 * POST /api/doctor/messages/[conversationId] — ответ админа/врача (`text`).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { serializeSupportMessage } from "@/modules/messaging/serializeSupportMessage";

const postBodySchema = z.object({
  text: z.string().min(1).max(4000),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
) {
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

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw?.trim() ? sinceRaw.trim() : undefined;

  const deps = buildAppDeps();
  const data = await deps.messaging.doctorSupport.getMessages(conversationId, {
    sinceCreatedAt: since ?? null,
    limit: 100,
  });
  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    conversationId,
    messages: data.messages.map(serializeSupportMessage),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
) {
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

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const result = await deps.messaging.doctorSupport.sendAdminReply(conversationId, parsed.data.text);
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
