/**
 * Общая отправка «запросить контакт» в личку TG/MAX (состояние TG + message.send).
 * Используется HTTP {@link registerBersoncareRequestContactRoute} и {@link executeAction} после channel link.
 */
import { randomUUID } from 'node:crypto';
import type { DbWriteMutation, DbWritePort, DispatchPort } from '../../kernel/contracts/index.js';
import { persistWrites } from '../../kernel/domain/executor/helpers.js';

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
  /** Личка: chat id в TG/MAX. */
  recipientId: string;
  /** Для корреляции в meta (не дедуп внутри этой функции). */
  correlationId?: string;
};

/**
 * Устанавливает await_contact для Telegram (через writePort), шлёт сообщение с кнопкой контакта.
 * MAX: только inline request_contact (состояние ведёт сценарий канала).
 */
export async function dispatchRequestContactToUser(params: DispatchRequestContactParams): Promise<void> {
  const { dispatchPort, writePort, channel, recipientId, correlationId } = params;

  if (channel === 'telegram' && writePort) {
    const writes: DbWriteMutation[] = [
      {
        type: 'user.state.set',
        params: {
          resource: 'telegram',
          channelUserId: recipientId,
          state: 'await_contact:subscription',
        },
      },
    ];
    await persistWrites(writePort, writes);
  }

  const eventId = `request-contact:${channel}:${randomUUID()}`;
  const replyMarkup = channel === 'telegram' ? telegramReplyMarkup() : maxInlineReplyMarkup();

  await dispatchPort.dispatchOutgoing({
    type: 'message.send',
    meta: {
      eventId,
      occurredAt: new Date().toISOString(),
      source: channel,
      ...(correlationId ? { correlationId } : {}),
    },
    payload: {
      recipient: { chatId: recipientId },
      message: { text: BERSONCARE_REQUEST_CONTACT_CONFIRM_TEXT },
      replyMarkup,
      delivery: { channels: [channel] },
    },
  });
}
