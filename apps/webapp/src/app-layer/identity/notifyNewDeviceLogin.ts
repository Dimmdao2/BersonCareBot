import { env } from '@/config/env';
import { logger } from '@/infra/logging/logger';
import { sendEmailSetupLinkViaIntegrator } from '@/infra/integrations/email/integratorEmailAdapter';
import { STAFF_SURFACE } from '@/config/productSurfaces';
import { countryName, deviceSummary, loginMethodLabel } from '@/shared/ui/security/loginHistoryText';
import type { SessionIdentityContact, UserRole } from '@/shared/types/session';

/**
 * Письмо «вход с нового устройства» (#1112, Л-8.2б; решение владельца 14.09).
 *
 * ⛔ Кому НЕ шлём — и почему это не забывчивость. Пациентам письмо не уходит: главное действие в
 * нём — «откройте раздел „Безопасность“ и посмотрите, сколько раз пытались подобрать пароль», а у
 * пациента такого раздела ЕЩЁ НЕТ (этап Л-6е владелец отложил словом «не сейчас»). Письмо, зовущее
 * на несуществующий экран, хуже отсутствия письма. Как только раздел появится, здесь снимется
 * ровно одно условие.
 *
 * ⛔ Первый вход в жизни учётной записи письма не вызывает: человек только что зарегистрировался и
 * стоит перед экраном. Это решает дверь записи входа, отдавая `firstLoginEver`.
 */

/** Разделы «Безопасность» у специалиста и у админа платформы живут по разным адресам. */
const SECURITY_PATH_BY_ROLE: Partial<Record<UserRole, string>> = {
  doctor: '/app/account?tab=security',
  admin: '/app/admin/security',
};

export type NewDeviceLoginNotice = {
  userId: string;
  role: UserRole;
  contacts: readonly SessionIdentityContact[] | undefined;
  method: string;
  country: string | null;
  deviceKind: string | null;
  os: string | null;
  browser: string | null;
  occurredAt: Date;
};

/**
 * Адрес берём ТОЛЬКО подтверждённый. Неподтверждённый может принадлежать кому угодно — в том числе
 * тому, кто его и вписал, пробравшись в учётную запись; отправить туда письмо о взломе значило бы
 * сообщить взломщику, что его заметили, и заодно выдать постороннему время и страну входа.
 */
function confirmedEmail(contacts: readonly SessionIdentityContact[] | undefined): string | null {
  if (!contacts) return null;
  const emails = contacts.filter((c) => c.kind === 'email' && c.confirmedAt);
  const chosen = emails.find((c) => c.isPrimary) ?? emails[0];
  const value = chosen?.value?.trim();
  return value ? value : null;
}

/**
 * Время — московское и НАЗВАНО московским.
 *
 * Часового пояса читателя мы в этот момент не знаем: письмо собирается на сервере, браузера рядом
 * нет. Показать время без пояса — значит дать человеку сверять «в 3 часа ночи» с собственными
 * воспоминаниями вслепую, а именно по этому он и решает, он это был или нет.
 */
function moscowStamp(at: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

function buildText(input: NewDeviceLoginNotice, securityUrl: string): string {
  const country = countryName(input.country);
  return [
    'Скорее всего это вы: так выглядит вход с нового телефона или компьютера, из другого ' +
      'браузера, после чистки данных сайта или из приватного окна. Тогда делать ничего не нужно, ' +
      'письмо можно удалить.',
    'Мы написали потому, что с этого устройства в вашу учётную запись раньше не входили.',
    [
      `Когда: ${moscowStamp(input.occurredAt)} (московское время)`,
      `Откуда: ${country ?? 'страна не определилась'}`,
      `Устройство: ${deviceSummary({
        deviceKind: input.deviceKind,
        os: input.os,
        browser: input.browser,
      })}`,
      `Как вошли: ${loginMethodLabel(input.method)}`,
    ].join('\n'),
    'Если это были не вы — откройте раздел «Безопасность»:',
    securityUrl,
    'Там видно, с каких устройств входили и сколько раз перед этим не подошёл пароль. Оттуда же ' +
      'можно завершить все остальные сеансы — на всех других устройствах потребуется войти заново.',
    'Пароль в этом письме мы не спрашиваем и никогда не спросим.',
  ].join('\n\n');
}

/**
 * Отправляет письмо. Ничего не бросает: вход уже состоялся, и уронить его из-за письма нельзя.
 *
 * ⚠️ Известный пробел, который здесь НЕ закрыт: отказ доставки почты не поднимает тревогу
 * (`operator-alerting-delivery-failure-gap`). Для обычной рассылки это терпимо, для письма о входе
 * постороннего — нет. Отдельный пункт плана Л-8.2д.
 */
export async function notifyNewDeviceLogin(input: NewDeviceLoginNotice): Promise<void> {
  try {
    const securityPath = SECURITY_PATH_BY_ROLE[input.role];
    if (!securityPath) return;

    const to = confirmedEmail(input.contacts);
    if (!to) {
      // Не ошибка: у учётной записи может не быть подтверждённой почты (вход по мессенджеру или по
      // телефону). Сообщить в этом случае нечем и некуда — пишем в лог, чтобы молчание было видимым.
      logger.info(
        { userId: input.userId, role: input.role },
        '[new-device] no confirmed email, sign-in notice not sent',
      );
      return;
    }

    const result = await sendEmailSetupLinkViaIntegrator(
      to,
      `Вход в ${STAFF_SURFACE.name} с нового устройства`,
      buildText(input, `${env.APP_BASE_URL}${securityPath}`),
    );
    if (!result.ok) {
      logger.error(
        { userId: input.userId, reason: result.error },
        '[new-device] sign-in notice was not delivered',
      );
      return;
    }
    // Запись об УСПЕХЕ нужна не меньше записи об отказе: разбирая случай, поддержка обязана уметь
    // ответить «мы вам писали тогда-то», а не гадать. Адрес в лог не пишем — это персональные данные.
    logger.info(
      { userId: input.userId, role: input.role, method: input.method },
      '[new-device] sign-in notice sent',
    );
  } catch (err) {
    logger.error(
      { err, reason: String(err), userId: input.userId },
      '[new-device] sign-in notice failed',
    );
  }
}
