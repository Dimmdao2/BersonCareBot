/**
 * POST /api/admin/smtp-test — отправить тестовое письмо по сохранённым настройкам `smtp_outbound` (admin).
 * Guard: role === 'admin'
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { sendTransactionalSmtpEmail } from "@/modules/outbound-email/sendTransactionalSmtp";

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

  const smtp = await buildAppDeps().systemSettings.getSetting("smtp_outbound", "admin");
  const res = await sendTransactionalSmtpEmail({
    smtpValueJson: smtp?.valueJson,
    to: body.to,
    subject: "Тест SMTP — BersonCareBot",
    text: "Это тестовое письмо с экрана настроек администратора. Если вы его получили, исходящая почта настроена верно.",
  });

  if (res.ok) {
    return NextResponse.json({ ok: true });
  }
  if (res.error === "smtp_not_configured" || res.error === "smtp_password_missing") {
    return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: false, error: "send_failed", message: res.error }, { status: 502 });
}
