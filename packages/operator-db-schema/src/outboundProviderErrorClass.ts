/**
 * Классификация отказов исходящего провайдера доставки (design D-f).
 *
 * Почему это отдельный класс, а не «просто ошибка отправки»:
 *
 *  - Исчерпание суточной квоты у SES-подобных релеев приходит как `454 Throttling failure:
 *    Daily message quota exceeded` — это **4xx**, и конформный SMTP-клиент будет молча
 *    ретраить его сутками. Именно так июльский отказ прожил больше суток незамеченным.
 *  - Исчерпание кредитов у SendGrid-подобных API приходит как **HTTP 401**, который
 *    прикладной код рутинно кладёт в корзину «проблема с учёткой, залогируем».
 *
 * Поэтому обе формы поднимаются в собственный класс и пейджатся с ПЕРВОГО раза
 * (`PAGE_ON_FIRST_OCCURRENCE_ERROR_CLASSES`), а не по накопительному порогу.
 *
 * Модуль чистый (без зависимостей) и живёт в общем пакете, потому что классифицировать
 * обязаны оба приложения: integrator (точка отказа) и webapp (алерты и сводка).
 */

export const OUTBOUND_PROVIDER_ERROR_CLASSES = [
  'provider_not_configured',
  /** Квота/лимит скорости провайдера исчерпаны (SES `454`, `452 4.5.3`, `4.7.x` throttling). */
  'provider_quota_exhausted',
  /** Кончились оплаченные кредиты/тариф (SendGrid `401 Maximum credits exceeded`). */
  'provider_credit_exhausted',
  /** Провайдер отверг учётные данные (SMTP `535`/`530`, `EAUTH`, HTTP `401`/`403`). */
  'provider_auth_rejected',
  /** Всё остальное: сеть, таймаут, 5xx. */
  'provider_send_failed',
] as const;

export type OutboundProviderErrorClass = (typeof OUTBOUND_PROVIDER_ERROR_CLASSES)[number];

/**
 * Классы, которые пейджатся с ПЕРВОГО появления, а не по порогу.
 *
 * `provider_auth_rejected` входит сюда намеренно: HTTP 401 от провайдера рассылки
 * неотличим от «кончились кредиты» без разбора тела ответа, и обе интерпретации
 * означают «доставка мертва прямо сейчас».
 */
export const PAGE_ON_FIRST_OCCURRENCE_ERROR_CLASSES: readonly OutboundProviderErrorClass[] = [
  'provider_quota_exhausted',
  'provider_credit_exhausted',
  'provider_auth_rejected',
  'provider_not_configured',
];

export function isPageOnFirstOccurrenceProviderErrorClass(
  errorClass: string | null | undefined,
): boolean {
  if (!errorClass) return false;
  return PAGE_ON_FIRST_OCCURRENCE_ERROR_CLASSES.includes(errorClass as OutboundProviderErrorClass);
}

/** Классы, означающие «провайдер не примет ничего, пока человек не вмешается». */
export function isOutboundProviderDeliveryDeadClass(
  errorClass: string | null | undefined,
): boolean {
  return isPageOnFirstOccurrenceProviderErrorClass(errorClass);
}

const QUOTA_PHRASES = [
  'daily message quota exceeded',
  'daily sending quota',
  'sending quota',
  'message quota',
  'quota exceeded',
  'exceeded your messaging',
  'maximum sending rate',
  'throttling failure',
  'too many messages',
  'rate limit exceeded',
  'daily limit',
  'limit exceeded',
];

const CREDIT_PHRASES = [
  'maximum credits exceeded',
  'credits exceeded',
  'credit limit',
  'out of credits',
  'insufficient credit',
  'insufficient funds',
  'insufficient balance',
  'no credits',
  'not enough money',
  'недостаточно средств',
  'закончились средства',
  'нулевой баланс',
  'тариф исчерпан',
];

const AUTH_PHRASES = [
  'authentication failed',
  'authentication required',
  'authentication credentials invalid',
  'invalid login',
  'invalid credentials',
  'bad credentials',
  'username and password not accepted',
  'auth command failed',
  'unauthorized',
  'eauth',
];

const NOT_CONFIGURED_PHRASES = [
  'email_not_configured',
  'provider_not_configured',
  'smtp_not_configured',
];

/** SMTP-коды, однозначно означающие исчерпание квоты/лимита скорости. */
const QUOTA_SMTP_CODES = [/\b454\b/, /\b452\b/, /\b421\b/, /\b4\.7\.\d+\b/, /\b4\.5\.3\b/];

/** SMTP/HTTP-коды отказа по учётным данным. */
const AUTH_SMTP_CODES = [/\b535\b/, /\b534\b/, /\b530\b/, /\b538\b/, /\b5\.7\.[08]\b/];

function containsAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function matchesAny(haystack: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((p) => p.test(haystack));
}

function hasHttpStatus(raw: string, status: number): boolean {
  return new RegExp(`(?:^|[^0-9])${status}(?:[^0-9]|$)`).test(raw);
}

/**
 * Разбирает произвольный текст ошибки провайдера в один из классов.
 *
 * Порядок проверок важен: квота и кредиты проверяются ДО учётных данных, потому что
 * `401 Maximum credits exceeded` содержит и то, и другое, а смысл у него — «кончились деньги».
 */
export function classifyOutboundProviderErrorClass(
  errorMessage: string | null | undefined,
): OutboundProviderErrorClass {
  const raw = (errorMessage ?? '').trim();
  if (!raw) return 'provider_send_failed';
  const lower = raw.toLowerCase();

  if (containsAny(lower, NOT_CONFIGURED_PHRASES)) return 'provider_not_configured';

  if (containsAny(lower, CREDIT_PHRASES)) return 'provider_credit_exhausted';
  if (containsAny(lower, QUOTA_PHRASES)) return 'provider_quota_exhausted';

  // SES-подобный `454 …` — 4xx, который иначе ретраится молча.
  if (matchesAny(lower, QUOTA_SMTP_CODES)) return 'provider_quota_exhausted';

  if (matchesAny(lower, AUTH_SMTP_CODES)) return 'provider_auth_rejected';
  if (containsAny(lower, AUTH_PHRASES)) return 'provider_auth_rejected';

  // SendGrid-подобный credit-exhaustion приходит именно так; трактуем как отказ учётки,
  // который тоже пейджится с первого раза, а не как «залогируем и забудем».
  if (hasHttpStatus(lower, 401) || hasHttpStatus(lower, 403)) return 'provider_auth_rejected';

  return 'provider_send_failed';
}

/** Человекочитаемая строка для алерта/сводки (без PII и без текста письма). */
export function describeOutboundProviderErrorClass(errorClass: string | null | undefined): string {
  switch (errorClass) {
    case 'provider_quota_exhausted':
      return 'квота провайдера исчерпана';
    case 'provider_credit_exhausted':
      return 'кончились кредиты/оплата у провайдера';
    case 'provider_auth_rejected':
      return 'провайдер отверг учётные данные (или кончились кредиты)';
    case 'provider_not_configured':
      return 'провайдер не настроен';
    case 'provider_send_failed':
      return 'сбой отправки';
    default:
      return String(errorClass ?? 'неизвестный класс');
  }
}

/**
 * Значение `operator_incidents.direction` для отказа исходящего провайдера доставки.
 *
 * Оно ОДНО на оба приложения намеренно. Раньше строку писали литералом в четырёх местах
 * интегратора, а webapp сравнивал со своей константой; проба здоровья писала рядом свой
 * `'outbound'`, и её отказ по учётным данным не попадал в путь «пейджить с первого появления»
 * ни при каком содержании ошибки. Совпадение двух строк — не то, что стоит проверять глазами.
 */
export const OUTBOUND_PROVIDER_INCIDENT_DIRECTION = 'outbound_delivery_provider';
