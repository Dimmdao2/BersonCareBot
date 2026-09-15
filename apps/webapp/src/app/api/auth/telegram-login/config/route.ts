import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { logAuthRouteTiming } from '@/modules/auth/authRouteObservability';
import {
  getTelegramLoginWidgetBotUsername,
  isTelegramLoginWidgetEnabled,
} from '@/modules/auth/authChannelPolicy';

const ROUTE = 'auth/telegram-login/config';

/**
 * Публичный конфиг для Telegram Login Widget: имя ЕГО бота (без секретов).
 *
 * Это не бот, который присылает код в чат: у виджета свой переключатель и свой бот с привязанным
 * доменом (владелец 16.09.2026 — «одно дело логин виджет, другое подтверждение номера в телеграм»).
 * Выключенный переключатель отдаёт `null`, и кнопка не появляется.
 */
export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/telegram-login/config:GET', request);
  const startedAt = Date.now();
  const enabled = await isTelegramLoginWidgetEnabled();
  const raw = enabled ? await getTelegramLoginWidgetBotUsername() : '';
  const botUsername = raw.length > 0 ? raw : null;
  const res = NextResponse.json({ ok: true as const, botUsername });
  logAuthRouteTiming({
    route: ROUTE,
    request,
    startedAt,
    status: 200,
    outcome: 'ok',
  });
  return res;
}
