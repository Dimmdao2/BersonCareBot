/**
 * POST /api/admin/smtp-test — отправить тестовое письмо по сохранённым настройкам `smtp_outbound` (admin).
 * Guard: role === 'admin'
 *
 * S10: теперь отправляет через integrator relay-outbound (channel:'email') → dispatchPort → EmailDeliveryAdapter.
 * Больше не использует webapp SMTP напрямую.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getCurrentSession } from "@/modules/auth/service";
import { relayOutbound } from "@/modules/messaging/relayOutbound";

const bodySchema = z.object({
  to: z.string().trim().email(),
});

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json: unknown = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const res = await relayOutbound({
    messageId: `smtp-test:${randomUUID()}`,
    channel: "email",
    recipient: body.to,
    text: "Это тестовое письмо с экрана настроек администратора. Если вы его получили, исходящая почта настроена верно.",
    metadata: { subject: "Тест SMTP — BersonCare" },
  });

  if (res.ok) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "send_failed", message: res.reason }, { status: 502 });
}
