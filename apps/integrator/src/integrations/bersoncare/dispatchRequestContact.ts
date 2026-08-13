/**
 * Общая одноразовая отправка «запросить контакт» в личку TG/MAX.
 * Используется HTTP {@link registerBersoncareRequestContactRoute} и {@link executeAction} после channel link.
 */
import { randomUUID } from 'node:crypto';
import type { DbWriteMutation, DbWritePort, DispatchPort } from '../../kernel/contracts/index.js';
import { persistWrites } from '../../kernel/domain/executor/helpers.js';
import { maxUserRecipient } from '../max/maxRecipient.js';

/** Синхронно с telegram:user/templates.json / requestContactRoute. */
export const BERSONCARE_REQUEST_CONTACT_CONFIRM_TEXT =
  'Для работы с ботом и приложением необходимо привязать номер телефона. Это позволит вам получить доступ к своим данным на любой платформе: Телеграм, Max, мобильное веб-приложение и в обычном браузере.';

export const BERSONCARE_REQUEST_CONTACT_BUTTON_TEXT = '📲 Отправить номер телефона';

function telegramReplyMarkup() {
  return {
    keyboard: [[{ text: BERSONCARE_REQUEST_CONTACT_BUTTON_TEXT, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function maxInlineReplyMarkup() {
  return {
    inline_keyboard: [
      [{ text: 'Поделиться номером телефона', request_contact: true } as Record<string, unknown>],
    ],
  };
}

export type DispatchRequestContactParams = {
  dispatchPort: DispatchPort;
  writePort?: DbWritePort;
  channel: 'telegram' | 'max';
  /** Личка: Telegram chat id; MAX platform user id. */
  recipientId: string;
  /** Для корреляции в meta (не дедуп внутри этой функции). */
  correlationId?: string;
};

/**
 * Во входящем channel-link flow Telegram может сначала создать канонический channel binding через `writePort`.
 * Подписанный исходящий request-contact не передаёт `writePort`: отправка pre-login handshake сама по себе не
 * создаёт человека, не угадывает организацию и не меняет channel binding.
 * MAX: inline-кнопка `request_contact` в том же сообщении (см. `max/user/scripts.json`, API — `type: request_contact` в `deliveryAdapter`).
 *
 * Сохранённого диалогового состояния нет: следующий contact event определяется самим типом события.
 */
export async function dispatchRequestContactToUser(
  params: DispatchRequestContactParams,
): Promise<void> {
  const { dispatchPort, writePort, channel, recipientId, correlationId } = params;

  if (channel === 'telegram' && writePort) {
    const id = recipientId.trim();
    const writes: DbWriteMutation[] = [
      { type: 'user.upsert', params: { resource: 'telegram', externalId: id } },
    ];
    await persistWrites(writePort, writes);
  }

  const eventId = `request-contact:${channel}:${randomUUID()}`;
  const replyMarkup = channel === 'telegram' ? telegramReplyMarkup() : maxInlineReplyMarkup();

  const recipient = channel === 'max' ? maxUserRecipient(recipientId) : { chatId: recipientId };

  await dispatchPort.dispatchOutgoing({
    type: 'message.send',
    meta: {
      eventId,
      occurredAt: new Date().toISOString(),
      source: channel,
      outboundMessageClass: 'auth_code',
      outboundCapability: 'contact_handshake',
      ...(correlationId ? { correlationId } : {}),
    },
    payload: {
      recipient,
      message: { text: BERSONCARE_REQUEST_CONTACT_CONFIRM_TEXT },
      replyMarkup,
      delivery: { channels: [channel] },
    },
  });
}
