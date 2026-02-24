import type { UserPort } from '../ports/user.js';
import type { WebhookContent } from '../webhookContent.js';
import type { OutgoingAction } from '../types.js';
import { tryConsumeStart } from './onboarding.js';

const mainMenuMarkup = (content: WebhookContent) => ({
  keyboard: content.mainMenuKeyboard,
  resize_keyboard: true,
  one_time_keyboard: false,
});

export async function handleStart(
  chatId: number,
  telegramId: number,
  startText: string,
  userPort: UserPort,
  content: WebhookContent,
): Promise<{ consumed: boolean; actions: OutgoingAction[] }> {
  const allow = await tryConsumeStart(telegramId, userPort);
  if (!allow) return { consumed: false, actions: [] };

  const payloadMatch = /^\/start\s+(.+)$/.exec(startText.trim());
  const payload = payloadMatch?.[1]?.trim() ?? '';
  const isRubitimeRecordId = /^[A-Za-z0-9_-]{1,120}$/.test(payload);

  if (isRubitimeRecordId) {
    await userPort.setTelegramUserState(
      String(telegramId),
      `await_contact:rubitime_record:${payload}`,
    );
    return {
      consumed: true,
      actions: [
        {
          type: 'sendMessage',
          chatId,
          text: content.messages.confirmPhoneForRubitime,
          replyMarkup: content.requestContactKeyboard,
        },
      ],
    };
  }

  await userPort.setTelegramUserState(String(telegramId), 'idle');
  return {
    consumed: true,
    actions: [
      { type: 'sendMessage', chatId, text: content.messages.welcome, replyMarkup: mainMenuMarkup(content) },
    ],
  };
}

export async function handleAsk(
  chatId: number,
  telegramId: string,
  userPort: UserPort,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  await userPort.setTelegramUserState(telegramId, 'waiting_for_question');
  return [
    { type: 'sendMessage', chatId, text: content.messages.describeQuestion, replyMarkup: mainMenuMarkup(content) },
  ];
}

export async function handleQuestion(
  chatId: number,
  telegramId: string,
  _text: string,
  userPort: UserPort,
  content: WebhookContent,
  adminForward: { chatId: number; text: string } | undefined,
): Promise<OutgoingAction[]> {
  await userPort.setTelegramUserState(telegramId, 'idle');
  const actions: OutgoingAction[] = [];
  if (adminForward) {
    actions.push({ type: 'sendMessage', chatId: adminForward.chatId, text: adminForward.text });
  }
  actions.push({
    type: 'sendMessage',
    chatId,
    text: content.messages.questionAccepted,
    replyMarkup: mainMenuMarkup(content),
  });
  return actions;
}

export async function handleBook(
  chatId: number,
  telegramId: string,
  userPort: UserPort,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  await userPort.setTelegramUserState(telegramId, 'idle');
  return [
    { type: 'sendMessage', chatId, text: content.messages.notImplemented, replyMarkup: mainMenuMarkup(content) },
  ];
}

export async function handleMore(chatId: number, content: WebhookContent): Promise<OutgoingAction[]> {
  return [
    { type: 'sendMessage', chatId, text: content.messages.chooseMenu, replyMarkup: content.moreMenuInline },
  ];
}

export async function handleDefaultIdle(chatId: number, content: WebhookContent): Promise<OutgoingAction[]> {
  return [
    { type: 'sendMessage', chatId, text: content.messages.chooseMenu, replyMarkup: mainMenuMarkup(content) },
  ];
}
