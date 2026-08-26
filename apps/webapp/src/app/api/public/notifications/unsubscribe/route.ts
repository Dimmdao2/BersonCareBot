import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import { patientNotificationTopicDisplayTitle } from '@/modules/patient-notifications/topicDisplayTitles';
import { escapeHtml } from '@/shared/lib/escapeHtml';

export function buildTopicUnsubscribeResponseHtml(input: {
  applied: boolean;
  topicCode: string | null;
  topicTitle: string | null;
}): string {
  const title = (
    input.topicTitle ?? patientNotificationTopicDisplayTitle(input.topicCode ?? '', '')
  ).trim();
  const topicCopy = input.applied && title
    ? `Вы отписались от темы «${escapeHtml(title)}». Остальные уведомления продолжат приходить.`
    : input.applied
      ? 'Настройки уведомлений обновлены.'
      : 'Не удалось изменить настройки уведомлений. Откройте настройки и повторите попытку.';
  const heading = input.applied
    ? 'Настройки уведомлений обновлены'
    : 'Настройки уведомлений не изменены';
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Настройки уведомлений</title>
  </head>
  <body style="margin:0;background:#f6f4ef;color:#1f2937;font-family:system-ui,sans-serif">
    <main style="max-width:520px;margin:64px auto;padding:24px">
      <h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
      <p style="font-size:16px;line-height:1.5;margin:0">${topicCopy}</p>
      <p style="font-size:16px;line-height:1.5;margin:12px 0 0">Другие темы можно изменить в <a href="${routePaths.notificationSettings}">настройках уведомлений</a>.</p>
    </main>
  </body>
</html>`;
}

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/public/notifications/unsubscribe:GET', request);
  const token = new URL(request.url).searchParams.get('token') ?? '';
  let result: { applied: boolean; topicCode: string | null; topicTitle: string | null } = {
    applied: false,
    topicCode: null,
    topicTitle: null,
  };
  try {
    result = await buildAppDeps().topicUnsubscribe.unsubscribeByToken(token);
  } catch {
    // A signed link keeps its title even when its recipient no longer exists, so that fact is never exposed.
  }
  return new NextResponse(buildTopicUnsubscribeResponseHtml(result), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
