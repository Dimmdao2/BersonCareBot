import { env } from '@/config/env';
import { logger } from '@/infra/logging/logger';
import { sendEmailSetupLinkViaIntegrator } from '@/infra/integrations/email/integratorEmailAdapter';
import { STAFF_SURFACE } from '@/config/productSurfaces';
import { countryName, deviceSummary, loginMethodLabel } from '@/shared/ui/security/loginHistoryText';
import type { SessionIdentityContact, UserRole } from '@/shared/types/session';
import { issueLoginSecurityAction } from '@/infra/loginSecurityAction';

/**
 * Письмо «вход с нового устройства» (#1112, Л-8.2б; решение владельца 14.09).
 *
 * ⛔ Кому НЕ шлём — и почему это не забывчивость. Пациентам письмо не уходит: у пациента НЕТ пароля,
 * вход только по одноразовому коду (решение владельца 14.09). Подбирать нечего, и рассказывать в
 * письме нечего: весь смысл этого письма — «посмотрите, сколько раз перед входом не подошёл
 * пароль», а у пациента такой величины не существует. Если у пациентов когда-нибудь появится
 * пароль, условие снимется вместе с этим доводом, а не раньше.
 *
 * ⛔ Первый вход в жизни учётной записи письма не вызывает: человек только что зарегистрировался и
 * стоит перед экраном. Это решает дверь записи входа, отдавая `firstLoginEver`.
 */

export type NewDeviceLoginNotice = {
  userId: string;
  sourceLoginEventId: string;
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
 * Адрес берём ТОЛЬКО подтверждённый — потому что неподтверждённый никто никогда не проверял. Это
 * может быть опечатка или чужой живой ящик: письмо тогда не дойдёт до того, кого мы предупреждаем,
 * и заодно сообщит постороннему время, страну и устройство входа.
 *
 * ⛔ Не путать с защитой от взломщика (поправка владельца 14.09): кто сумел вписать адрес в чужую
 * учётную запись, тот сумеет его и подтвердить, так что подтверждение от него не спасает. Оно
 * отвечает ровно за одно — что ящик вообще принадлежит этому человеку.
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

const ACTION_LABEL = 'Закрыть сеансы + смена пароля';

function buildText(input: NewDeviceLoginNotice, actionUrl: string | null): string {
  const country = countryName(input.country);
  const paragraphs = [
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
  ];
  if (actionUrl) {
    paragraphs.push(
      'Если это были не вы, нажмите кнопку ниже. Мы завершим вход на всех устройствах. При следующем ' +
        'входе потребуется выбрать новый пароль.',
      `${ACTION_LABEL}:\n${actionUrl}`,
      'Ссылка действует 7 дней и сработает только один раз.',
    );
  } else {
    paragraphs.push(
      'Если это были не вы, откройте раздел «Безопасность» в кабинете и завершите вход на всех ' +
        'устройствах.',
    );
  }
  paragraphs.push('Пароль в этом письме мы не спрашиваем и никогда не спросим.');
  return paragraphs.join('\n\n');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildHtml(input: NewDeviceLoginNotice, actionUrl: string | null): string {
  const country = countryName(input.country) ?? 'страна не определилась';
  const device = deviceSummary({
    deviceKind: input.deviceKind,
    os: input.os,
    browser: input.browser,
  });
  const parts = [
    '<div style="font:16px/1.5 Arial,sans-serif;color:#17264a;max-width:640px">',
    '<p>Скорее всего это вы: так выглядит вход с нового телефона или компьютера, из другого ' +
      'браузера, после чистки данных сайта или из приватного окна. Тогда делать ничего не нужно.</p>',
    '<p>Мы написали потому, что с этого устройства в вашу учётную запись раньше не входили.</p>',
    `<p><strong>Когда:</strong> ${escapeHtml(moscowStamp(input.occurredAt))} (московское время)<br>` +
      `<strong>Откуда:</strong> ${escapeHtml(country)}<br>` +
      `<strong>Устройство:</strong> ${escapeHtml(device)}<br>` +
      `<strong>Как вошли:</strong> ${escapeHtml(loginMethodLabel(input.method))}</p>`,
  ];
  if (actionUrl) {
    parts.push(
      '<p>Если это были не вы, завершите вход на всех устройствах. При следующем входе потребуется ' +
        'выбрать новый пароль.</p>',
      `<p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;` +
        'border-radius:8px;background:#284da0;color:#fff;text-decoration:none;font-weight:700">' +
        `${ACTION_LABEL}</a></p>`,
      '<p>Ссылка действует 7 дней и сработает только один раз.</p>',
    );
  } else {
    parts.push(
      '<p>Если это были не вы, откройте раздел «Безопасность» в кабинете и завершите вход на всех ' +
        'устройствах.</p>',
    );
  }
  parts.push(
    '<p>Пароль в этом письме мы не спрашиваем и никогда не спросим.</p>',
    '</div>',
  );
  return parts.join('');
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
    if (input.role !== 'doctor' && input.role !== 'admin') return;

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

    let actionUrl: string | null = null;
    try {
      const actionValue = await issueLoginSecurityAction({
        userId: input.userId,
        sourceLoginEventId: input.sourceLoginEventId,
      });
      actionUrl = `${env.APP_BASE_URL}/app/protect-account?key=${encodeURIComponent(actionValue)}`;
    } catch (err) {
      // У сотрудника может не быть пароля (messenger/passkey/OAuth). Тогда action-key не имеет
      // смысла и SQL-дверь закономерно отказывает, но сам сигнал о новом устройстве терять нельзя.
      // Любой иной отказ выпуска ключа тоже не должен отменять независимое письмо-предупреждение.
      logger.warn(
        { err, reason: String(err), userId: input.userId },
        '[new-device] protection action unavailable; sending notice without action',
      );
    }
    const result = await sendEmailSetupLinkViaIntegrator(
      'new_device_login',
      to,
      `Вход в ${STAFF_SURFACE.name} с нового устройства`,
      buildText(input, actionUrl),
      buildHtml(input, actionUrl),
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
