import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';

const RESPONSE_HTML = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Настройки уведомлений</title>
  </head>
  <body style="margin:0;background:#f6f4ef;color:#1f2937;font-family:system-ui,sans-serif">
    <main style="max-width:520px;margin:64px auto;padding:24px">
      <h1 style="font-size:20px;margin:0 0 12px">Настройки уведомлений обновлены</h1>
      <p style="font-size:16px;line-height:1.5;margin:0">Сообщения этой темы больше не будут приходить.</p>
    </main>
  </body>
</html>`;

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/public/notifications/unsubscribe:GET', request);
  const token = new URL(request.url).searchParams.get('token') ?? '';
  try {
    await buildAppDeps().topicUnsubscribe.unsubscribeByToken(token);
  } catch {
    // Identical body/status for invalid, stale and unknown recipients: no enumeration oracle.
  }
  return new NextResponse(RESPONSE_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
