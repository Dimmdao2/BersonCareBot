/**
 * Единственный порт постановки исходящего сообщения в очередь доставки интегратора.
 *
 * Решение владельца 19.08: «письмо и уведомление не надо ждать — абсолютно точно… должно быть
 * универсальным по сути механизмом, в который просто передается нужный контекст от вебапп. Не 100
 * функций на каждое отправляемое событие.»
 *
 * Поэтому здесь ОДИН тип контекста и ОДИН метод. Вид сообщения — это `purpose`, а не новый тип,
 * новый метод или новый вид очереди: `purpose` уходит в `event_id` и никем не разбирается по
 * веткам. Резолвер арендатора (`app.resolve_outgoing_delivery_scope`) отдаёт `tenant` первой
 * веткой по непустому `organization_id`, до любого разбора вида, — поэтому новое сообщение не
 * требует правки ни его, ни воркера.
 *
 * Класс политики внешнего выхода сюда НЕ передаётся: его выводит сам объявленный корень в БД,
 * повторяя правило подписанного relay-маршрута. Вызывающий не может назначить себе маркер шире
 * того, что получил бы через HTTP-relay.
 */

/** Каналы, у которых в интеграторе есть адаптер доставки. */
export type OutboundMessageChannel = 'email' | 'telegram' | 'max' | 'sms' | 'web_push';

/** Содержимое сообщения. Переносится в payload намерения ДОСЛОВНО, поле в поле. */
export type OutboundMessageContent = {
  /** Обязательный plain-текст: тело письма / текст сообщения. */
  text: string;
  /** HTML-часть письма (email). */
  html?: string;
  /** Тема письма (email). */
  subject?: string;
  /** Base64-тело .ics-вложения (email). */
  icsContent?: string;
  /** Имя .ics-вложения (email). */
  icsFilename?: string;
  /** Inline-клавиатура (telegram / max). */
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
  /** Заголовок push-уведомления (web_push). */
  title?: string;
  /** Ссылка перехода push-уведомления (web_push). */
  url?: string;
  /** Клиничная рассылка: отправка не откатывается на платформенного отправителя. */
  senderScope?: 'clinic_required';
};

export type OutboundMessageContext = {
  /** Арендатор. `null` — платформенное сообщение вне клиники. */
  organizationId: string | null;
  /** Назначение сообщения, например `booking.confirmation`. Идёт в `event_id`. */
  purpose: string;
  /** Стабильный ключ отправителя. `event_id` = `purpose:idempotencyKey`, колонка UNIQUE. */
  idempotencyKey: string;
  channel: OutboundMessageChannel;
  /** Адрес в терминах канала: email / chat id / user id / телефон / push user id. */
  recipient: string;
  content: OutboundMessageContent;
  /** Предел попыток очереди. По умолчанию 6 — общая лестница ретраев доставки. */
  maxAttempts?: number;
};

export type OutboundMessageQueuePort = {
  /** `true` — вставлена новая строка; `false` — такое сообщение уже стоит в очереди или отправлено. */
  enqueue(context: OutboundMessageContext): Promise<boolean>;
};

export const DEFAULT_OUTBOUND_MESSAGE_MAX_ATTEMPTS = 6;
