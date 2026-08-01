import { getPublicRuntimeValue } from '@/modules/system-settings/configAdapter';

/**
 * Нормализует ник бота MAX для пути `https://max.ru/<nick>?start=…`.
 * Допускается вставка полной ссылки `https://max.ru/id…_bot` (берётся первый сегмент пути).
 */
export function normalizeMaxBotNicknameInput(raw: string): string {
  let s = (raw ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const host = u.hostname.replace(/^www\./i, '').toLowerCase();
      if (host !== 'max.ru') return '';
      const path = u.pathname.replace(/^\/+|\/+$/g, '');
      const first = path.split('/').filter(Boolean)[0];
      return first ? decodeURIComponent(first) : '';
    } catch {
      return '';
    }
  }
  return s.replace(/^@/, '').split('/').filter(Boolean)[0]?.trim() ?? '';
}

/** Ник бота MAX для диплинков берётся только из DB-backed `max_login_bot_nickname`. */
export async function getMaxLoginBotNickname(): Promise<string> {
  return normalizeMaxBotNicknameInput(await getPublicRuntimeValue('max_login_bot_nickname'));
}
