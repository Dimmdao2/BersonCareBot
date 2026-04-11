import type { ChannelUserPort } from '../ports/user.js';
import type { WebhookContent } from '../webhookContent.js';
import type { OutgoingAction } from '../types.js';

export function mainMenuMarkup(content: WebhookContent) {
  return {
    keyboard: content.mainMenuKeyboard,
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

/**
 * Bot-side request-contact UX (state + reply keyboard template): shared shape used by legacy `handleUpdate`/`handleMessage` tests.
 * **Production:** the same UX is driven by `scripts.json` (and for callbacks without phone — early plan in `buildPlan`), not by importing this helper from the webhook pipeline.
 * Mini App may additionally call M2M request-contact if the WebView opened before projection caught up.
 */
export async function requestPhoneLink(
  chatId: number,
  channelId: string,
  userPort: ChannelUserPort,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  await userPort.setUserState(channelId, 'await_contact:subscription');
  return [
    {
      type: 'sendMessage',
      chatId,
      text: content.messages.confirmPhoneForBooking,
      replyMarkup: content.requestContactKeyboard,
    },
  ];
}
