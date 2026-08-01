import type { WebhookContent } from '../webhookContent.js';
import type { OutgoingAction } from '../types.js';

export async function handleMyBookings(
  chatId: number,
  messageId: number,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  return [
    {
      type: 'editMessageText',
      chatId,
      messageId,
      text: content.messages.bookingMy,
      replyMarkup: content.moreMenuInline,
    },
  ];
}

export async function handleBack(
  chatId: number,
  messageId: number,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  return [
    { type: 'editMessageText', chatId, messageId, text: ' ', replyMarkup: content.moreMenuInline },
    { type: 'editMessageReplyMarkup', chatId, messageId, replyMarkup: content.moreMenuInline },
  ];
}
