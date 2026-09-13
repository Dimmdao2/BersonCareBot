/**
 * Человеческие подписи для истории входов и устройств (#1112).
 *
 * Лежит в общем месте, а не рядом с одним экраном: эти подписи читают и разбор входов у админа
 * платформы, и вкладка «Безопасность». Две копии разошлись бы на первой же правке.
 *
 * Способ входа хранится машинным кодом — так его удобно искать и он не зависит от языка. Но читает
 * его ЧЕЛОВЕК, и печатать ему `second_factor_recovery_code` нельзя (критерий владельца: в интерфейсе
 * не должно быть машинных слов). Незнакомый код не печатается как есть — вместо него общая фраза.
 *
 * Часть значений — не «вход» в привычном смысле, а ПЕРЕВЫПУСК сессии после действия с безопасностью
 * (сменил пароль, включил второй фактор, вышел со всех устройств). Их подписи названы честно: иначе
 * разбирающий случай человек посчитает такую строку чужим входом и пойдёт искать взлом там, где его
 * не было.
 */
const METHOD_RU: Record<string, string> = {
  password: 'Пароль',
  email_code: 'Код на почту',
  registration_email_code: 'Код на почту при регистрации',
  email_setup_code: 'Код на почту при настройке входа',
  specialist_signup_email_code: 'Код на почту при регистрации специалиста',
  phone_otp: 'Код на телефон',
  passkey: 'Ключ доступа',
  telegram: 'Telegram',
  max: 'MAX',
  vk: 'VK',
  google_oauth: 'Вход через Google',
  apple_oauth: 'Вход через Apple',
  vk_oauth: 'Вход через VK',
  yandex_oauth: 'Вход через Яндекс',
  second_factor_email_code: 'Второй фактор — код на почту',
  second_factor_totp: 'Второй фактор — приложение с кодами',
  second_factor_recovery_code: 'Второй фактор — запасной код',
  invitation: 'По приглашению',
  invitation_email: 'По приглашению на почту',
  password_change: 'Сессия перевыпущена после смены пароля',
  recovery_code_confirmation: 'Сессия перевыпущена после запасного кода',
  totp_enrollment: 'Сессия перевыпущена после подключения второго фактора',
  session_revoke: 'Сессия перевыпущена после выхода с других устройств',
  unknown: 'Способ входа не сообщён',
};

export function loginMethodLabel(method: string): string {
  return METHOD_RU[method] ?? 'Другой способ входа';
}

const ROLE_RU: Record<string, string> = {
  client: 'Пациент',
  doctor: 'Врач или специалист',
  admin: 'Админ платформы',
};

export function loginRoleLabel(role: string): string {
  return ROLE_RU[role] ?? 'Роль не определена';
}

const DEVICE_RU: Record<string, string> = {
  mobile: 'Телефон',
  tablet: 'Планшет',
  desktop: 'Компьютер',
  bot: 'Робот',
};

/** Устройство одной строкой: «Телефон · iOS 17.2 · Safari 17.2». Пустые части не показываются. */
export function deviceSummary(input: {
  deviceKind: string | null;
  os: string | null;
  browser: string | null;
}): string {
  const kind = input.deviceKind ? (DEVICE_RU[input.deviceKind] ?? null) : null;
  const parts = [kind, input.os, input.browser].filter((v): v is string => Boolean(v && v.trim()));
  return parts.length > 0 ? parts.join(' · ') : 'Устройство не определилось';
}

export function outcomeLabel(outcome: string): string {
  if (outcome === 'success') return 'Вошли';
  if (outcome === 'failure') return 'Не удалось';
  return 'Состояние не определено';
}

/**
 * Название страны по двухбуквенному коду — «Россия», а не «RU»: в интерфейсе не должно быть
 * машинных слов. Если система не знает названия (редкий или спорный код), честно говорим, что
 * страна не определилась, вместо того чтобы показать человеку сам код.
 */
export function countryName(code: string | null | undefined): string | null {
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  try {
    const name = new Intl.DisplayNames(['ru'], { type: 'region' }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/** Несколько стран одной строкой: «Россия, Франция». Пусто — когда ни одна не определилась. */
export function countriesSummary(codes: readonly string[] | null | undefined): string | null {
  if (!codes || codes.length === 0) return null;
  const names = Array.from(
    new Set(codes.map((code) => countryName(code)).filter((name): name is string => name != null)),
  );
  return names.length > 0 ? names.join(', ') : null;
}
