import { getPublicRuntimeValue } from '@/modules/system-settings/configAdapter';

/**
 * Публичный username бота без `@` для Login Widget и `https://t.me/…`.
 * Не числовой id бота; public path читает только безопасную runtime-проекцию.
 */
export async function getTelegramLoginBotUsername(): Promise<string> {
  const raw = await getPublicRuntimeValue('telegram_login_bot_username');
  const s = typeof raw === 'string' ? raw.trim().replace(/^@/, '') : '';
  return s;
}
