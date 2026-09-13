import { STAFF_SURFACE } from '@/config/productSurfaces';
import { isSpecialistSignupDuplicateNoticeRateLimitedByKey } from '@/modules/auth/authRateLimits';

/**
 * Письмо владельцу почты, когда кто-то ещё раз заводит на неё регистрацию специалиста.
 *
 * Решение владельца 13.09. Форма регистрации теперь ВСЕГДА отвечает «мы отправили код» — по
 * ответу нельзя узнать, есть ли на этот адрес аккаунт. Но человек, чей адрес ввели, узнать об
 * этом должен: если это он сам и просто забыл пароль — ему нужна ссылка восстановления, если не
 * он — пусть видит попытку. Дословно: «На ваш имейл кто-то пытается повторно зарегистрировать
 * аккаунт. Если это не вы, можете не обращать внимание. Если вы забыли пароль, воспользуйтесь
 * ссылкой для восстановления пароля».
 *
 * Письмо шлётся ТОЛЬКО на адрес, за которым уже есть аккаунт, и не несёт ничего, кроме этого
 * факта: ни введённых чужой рукой ФИО, ни названия организации, ни адреса отправителя попытки.
 * Иначе форма регистрации превратилась бы в способ слать произвольный текст на чужую почту.
 */
export const SPECIALIST_SIGNUP_DUPLICATE_NOTICE_SUBJECT = `Попытка регистрации на ваш email в ${STAFF_SURFACE.name}`;

export function specialistSignupDuplicateNoticeText(recoveryUrl: string): string {
  return [
    `На ваш email кто-то пытается повторно зарегистрировать аккаунт в ${STAFF_SURFACE.name}.`,
    'Если это не вы — можно не обращать внимания: без доступа к этому почтовому ящику войти нельзя.',
    'Если это вы и просто забыли пароль — восстановите его по ссылке:',
    recoveryUrl,
  ].join('\n\n');
}

/**
 * Дверь ВОССТАНОВЛЕНИЯ пароля, а не регистрации.
 *
 * Четвёртый адверсарный аудит поймал здесь прямую ложь: ссылка вела на `?intent=specialist`, то
 * есть на форму регистрации — ровно ту, которая человеку только что отказала, — при том что в
 * письме написано «восстановите пароль по ссылке». `?recover=1` открывает вход email+пароль, где
 * стоит кнопка «Забыли пароль?»; код человек запрашивает сам.
 */
export function specialistSignupRecoveryUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/app/doctor/login?recover=1`;
}

type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Отправляет уведомление, если по этому адресу лимит ещё не выбран.
 *
 * Лимит обязателен: ответ формы теперь всегда успешный, то есть отправку может дёргать кто угодно
 * сколько угодно раз, и без потолка это стало бы способом завалить чужой ящик письмами. Результат
 * наружу не отдаётся — маршрут отвечает одинаково в любом случае.
 */
export async function sendSpecialistSignupDuplicateNotice(
  emailNormalized: string,
  baseUrl: string,
  send: (to: string, subject: string, text: string) => Promise<SendResult>,
): Promise<'sent' | 'rate_limited' | 'send_failed'> {
  if (await isSpecialistSignupDuplicateNoticeRateLimitedByKey(emailNormalized)) {
    return 'rate_limited';
  }
  const result = await send(
    emailNormalized,
    SPECIALIST_SIGNUP_DUPLICATE_NOTICE_SUBJECT,
    specialistSignupDuplicateNoticeText(specialistSignupRecoveryUrl(baseUrl)),
  );
  return result.ok ? 'sent' : 'send_failed';
}
