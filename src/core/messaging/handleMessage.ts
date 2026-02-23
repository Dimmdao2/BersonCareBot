import type { UserPort } from '../ports/user.js';
import type { WebhookContent } from '../webhookContent.js';
import type { OutgoingAction } from '../types.js';
import { tryConsumeStart } from '../onboarding/service.js';

const mainMenuMarkup = (content: WebhookContent) => ({
  keyboard: content.mainMenuKeyboard,
  resize_keyboard: true,
  one_time_keyboard: false,
});

/**
 * Handle /start: consume start token, return welcome + main menu actions if consumed.
 */
export async function handleStart(
  chatId: number,
  telegramId: number,
  userPort: UserPort,
  content: WebhookContent,
): Promise<{ consumed: boolean; actions: OutgoingAction[] }> {
  await userPort.setTelegramUserState(String(telegramId), 'idle');
  const allow = await tryConsumeStart(telegramId, userPort);
  if (!allow) return { consumed: false, actions: [] };
  return {
    consumed: true,
    actions: [
      {
        type: 'sendMessage',
        chatId,
        text: content.messages.welcome,
        replyMarkup: mainMenuMarkup(content),
      },
    ],
  };
}

/**
 * Handle "Задать вопрос": set state, return describe question action.
 */
export async function handleAsk(
  chatId: number,
  telegramId: string,
  userPort: UserPort,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  await userPort.setTelegramUserState(telegramId, 'waiting_for_question');
  return [
    {
      type: 'sendMessage',
      chatId,
      text: content.messages.describeQuestion,
      replyMarkup: mainMenuMarkup(content),
    },
  ];
}

/**
 * Handle question text in waiting_for_question: clear state, optional forward to admin, return actions.
 */
export async function handleQuestion(
  chatId: number,
  telegramId: string,
  text: string,
  userPort: UserPort,
  content: WebhookContent,
  adminForward: { chatId: number; text: string } | undefined,
): Promise<OutgoingAction[]> {
  await userPort.setTelegramUserState(telegramId, 'idle');
  const actions: OutgoingAction[] = [];
  if (adminForward) {
    actions.push({
      type: 'sendMessage',
      chatId: adminForward.chatId,
      text: adminForward.text,
    });
  }
  actions.push({
    type: 'sendMessage',
    chatId,
    text: content.messages.questionAccepted,
    replyMarkup: mainMenuMarkup(content),
  });
  return actions;
}

/**
 * Handle "Запись на приём": send not implemented.
 */
export async function handleBook(
  chatId: number,
  telegramId: string,
  userPort: UserPort,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  await userPort.setTelegramUserState(telegramId, 'idle');
  return [
    {
      type: 'sendMessage',
      chatId,
      text: content.messages.notImplemented,
      replyMarkup: mainMenuMarkup(content),
    },
  ];
}

/**
 * Handle "Меню": choose menu inline.
 */
export async function handleMore(
  chatId: number,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  return [
    {
      type: 'sendMessage',
      chatId,
      text: content.messages.chooseMenu,
      replyMarkup: content.moreMenuInline,
    },
  ];
}

/**
 * Default idle: main menu.
 */
export async function handleDefaultIdle(
  chatId: number,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  return [
    {
      type: 'sendMessage',
      chatId,
      text: content.messages.chooseMenu,
      replyMarkup: mainMenuMarkup(content),
    },
  ];
}
