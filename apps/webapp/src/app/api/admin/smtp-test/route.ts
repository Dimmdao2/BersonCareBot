/**
 * POST /api/admin/smtp-test — отправить тестовое письмо по сохранённым настройкам `smtp_outbound` (admin).
 * Guard: role === 'admin'
 *
 * S10: теперь отправляет через integrator relay-outbound (channel:'email') → dispatchPort → EmailDeliveryAdapter.
 * Больше не использует webapp SMTP напрямую.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { relayOutbound } from '@/modules/messaging/relayOutbound';

const bodySchema = z.object({
  to: z.string().trim().email(),
});

export async function POST(req: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  let body: z.infer<typeof bodySchema>;
  try {
    const json: unknown = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const probeRef = `smtp-test:${randomUUID()}`;
  const res = await relayOutbound({
    messageId: probeRef,
    channel: 'email',
    recipient: body.to,
    text: 'Это тестовое письмо с экрана настроек администратора. Если вы его получили, исходящая почта настроена верно.',
    metadata: { subject: 'Тест SMTP — BersonCare' },
  });

  if (res.ok) {
    return NextResponse.json({ ok: true, probeRef });
  }
  return NextResponse.json(
    { ok: false, error: 'send_failed', message: res.reason },
    { status: 502 },
  );
}
