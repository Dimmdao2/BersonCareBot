import type { UserPort } from '../ports/user.js';
import type { MessagingPort } from '../ports/messaging.js';
import type { WebhookContent } from '../webhookContent.js';
import { tryConsumeStart } from '../onboarding/service.js';

const mainMenuMarkup = (content: WebhookContent) => ({
  keyboard: content.mainMenuKeyboard,
  resize_keyboard: true,
  one_time_keyboard: false,
});

/**
 * Handle /start: consume start token, send welcome + main menu. Returns true if start was consumed.
 */
export async function handleStart(
  chatId: number,
  telegramId: number,
  userPort: UserPort,
  messagingPort: MessagingPort,
  content: WebhookContent,
): Promise<boolean> {
  await userPort.setTelegramUserState(String(telegramId), 'idle');
  const allow = await tryConsumeStart(telegramId, userPort);
  if (!allow) return false;
  await messagingPort.sendMessage({
    chat_id: chatId,
    text: content.messages.welcome,
    reply_markup: mainMenuMarkup(content),
  });
  return true;
}

/**
 * Handle "Задать вопрос": set state, send describe question.
 */
export async function handleAsk(
  chatId: number,
  telegramId: string,
  userPort: UserPort,
  messagingPort: MessagingPort,
  content: WebhookContent,
): Promise<void> {
  await userPort.setTelegramUserState(telegramId, 'waiting_for_question');
  await messagingPort.sendMessage({
    chat_id: chatId,
    text: content.messages.describeQuestion,
    reply_markup: mainMenuMarkup(content),
  });
}

/**
 * Handle question text in waiting_for_question: clear state, optional forward to admin, send confirmation.
 */
export async function handleQuestion(
  chatId: number,
  telegramId: string,
  text: string,
  userPort: UserPort,
  messagingPort: MessagingPort,
  content: WebhookContent,
  adminChatId: number | undefined,
  adminMessage: string | undefined,
  forwardToAdmin: (adminChatId: number, message: string) => Promise<void>,
): Promise<void> {
  await userPort.setTelegramUserState(telegramId, 'idle');
  if (adminChatId !== undefined && adminMessage !== undefined) {
    await forwardToAdmin(adminChatId, adminMessage);
  }
  await messagingPort.sendMessage({
    chat_id: chatId,
    text: content.messages.questionAccepted,
    reply_markup: mainMenuMarkup(content),
  });
}

/**
 * Handle "Запись на приём": send not implemented.
 */
export async function handleBook(
  chatId: number,
  telegramId: string,
  userPort: UserPort,
  messagingPort: MessagingPort,
  content: WebhookContent,
): Promise<void> {
  await userPort.setTelegramUserState(telegramId, 'idle');
  await messagingPort.sendMessage({
    chat_id: chatId,
    text: content.messages.notImplemented,
    reply_markup: mainMenuMarkup(content),
  });
}

/**
 * Handle "Меню": send choose menu inline.
 */
export async function handleMore(
  chatId: number,
  messagingPort: MessagingPort,
  content: WebhookContent,
): Promise<void> {
  await messagingPort.sendMessage({
    chat_id: chatId,
    text: content.messages.chooseMenu,
    reply_markup: content.moreMenuInline,
  });
}

/**
 * Default idle: send main menu.
 */
export async function handleDefaultIdle(
  chatId: number,
  messagingPort: MessagingPort,
  content: WebhookContent,
): Promise<void> {
  await messagingPort.sendMessage({
    chat_id: chatId,
    text: content.messages.chooseMenu,
    reply_markup: mainMenuMarkup(content),
  });
}
