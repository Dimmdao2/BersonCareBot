/**
 * «Определить имя бота по токену» — та же деривация, что и при сохранении токена, но для уже
 * сохранённого.
 *
 * Зачем отдельная дверь: имя бота принадлежит токену (владелец 16.09.2026 — «не понимаю почему
 * нельзя его просто получать по токену не спрашивая»), но токен вводится один раз и обычно давно.
 * Без этой двери единственный способ заполнить пустое имя — заново вписать токен, которого у
 * администратора под рукой может уже не быть; именно пустое имя молча выключало вход через Telegram
 * (`app.is_telegram_login_configured()` смотрит только на него).
 */
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { fetchTelegramBotIdentity } from '@/modules/messaging/telegramBotIdentity';

const MESSAGES: Readonly<Record<string, string>> = {
  credential_missing: 'Токен бота не сохранён — сначала сохраните его.',
  telegram_rejected: 'Telegram не признал сохранённый токен бота. Проверьте токен и повторите.',
  telegram_unreachable: 'Не удалось спросить Telegram. Повторите попытку.',
  integrator_unreachable: 'Не удалось спросить Telegram. Повторите попытку.',
  bot_without_username:
    'У бота с этим токеном нет публичного имени (@username). Задайте его в @BotFather.',
};

export async function POST() {
  // Платформенное имя для Login Widget — платформенная настройка; клиника называет свой бот через
  // сохранение собственного токена, где деривация уже встроена.
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const identity = await fetchTelegramBotIdentity({ scope: 'platform', audience: 'patient' });
  if (!identity.ok) {
    return NextResponse.json(
      { ok: false, error: identity.error, message: MESSAGES[identity.error] },
      { status: 400 },
    );
  }

  await buildAppDeps().systemSettings.updateSetting(
    'telegram_login_bot_username',
    'admin',
    { value: identity.username },
    gate.session.user.userId,
    { organizationId: null, allowPlatformGlobalFallbackWrite: true as const },
  );
  return NextResponse.json({ ok: true, username: identity.username });
}
