/** Телеграм: 5–32 символа, буквы/цифры/подчёркивание, первый символ — буква. */
const TELEGRAM_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

export type TelegramLoginBotUsernameResult =
  | { ok: true; value: string }
  | { ok: false; error: 'invalid_username' };

/**
 * Приводит введённое имя бота к голому username.
 *
 * Человек берёт имя бота оттуда, где он его видит: в самом Telegram это `@berson_bot`, в адресной
 * строке — `https://t.me/berson_bot`, в документации — просто `berson_bot`. Владелец 16.09.2026:
 * «надо давать вводить и так и так, просто фильтровать лишний символ». Поэтому форма принимает все
 * три записи, а нормализация живёт ЗДЕСЬ, рядом с чтением, а не в форме: тот же ключ пишут админский
 * PATCH и любой будущий вызов, и расходиться им нельзя — иначе снова появится значение, которое
 * читатель не узнаёт.
 *
 * Пустая строка — не ошибка: это снятие имени, то есть отключение диплинка (см. подсказку поля).
 */
export function normalizeTelegramLoginBotUsername(input: unknown): TelegramLoginBotUsernameResult {
  if (typeof input !== 'string') return { ok: false, error: 'invalid_username' };
  let value = input.trim();
  if (!value) return { ok: true, value: '' };
  // Ссылка любой формы: со схемой и без, t.me и telegram.me, с хвостом `?start=…` или `/`.
  const link = /^(?:https?:\/\/)?(?:www\.)?(?:t(?:elegram)?\.me)\/(.+)$/i.exec(value);
  if (link?.[1]) value = link[1];
  value = value.split(/[?#/]/)[0] ?? '';
  value = value.replace(/^@/, '').trim();
  if (!value) return { ok: false, error: 'invalid_username' };
  if (!TELEGRAM_USERNAME_RE.test(value)) return { ok: false, error: 'invalid_username' };
  return { ok: true, value };
}
