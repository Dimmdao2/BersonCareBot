import type { ChannelUserPort } from '../ports/user.js';
import type { WebhookContent } from '../webhookContent.js';
import type { OutgoingAction } from '../types.js';
import { tryConsumeStart } from './onboarding.js';
import { mainMenuMarkup, requestPhoneLink } from './requestContactFlow.js';

export async function handleStart(
  chatId: number,
  channelUserId: number,
  startText: string,
  hasLinkedPhone: boolean,
  userPort: ChannelUserPort,
  content: WebhookContent,
): Promise<{ consumed: boolean; actions: OutgoingAction[] }> {
  // ARCH-V3 MOVE
  // этот код должен быть перенесён в orchestrator (сценарные правила обработки команд/messages)
  const allow = await tryConsumeStart(channelUserId, userPort);
  if (!allow) return { consumed: false, actions: [] };

  const payloadMatch = /^\/start\s+(.+)$/.exec(startText.trim());
  const payload = payloadMatch?.[1]?.trim() ?? '';
  const isExternalRecordId = /^[A-Za-z0-9_-]{1,120}$/.test(payload);

  if (isExternalRecordId) {
    if (!hasLinkedPhone) {
      return { consumed: true, actions: await requestPhoneLink(chatId, String(channelUserId), userPort, content) };
    }
    await userPort.setUserState(String(channelUserId), 'idle');
    return {
      consumed: true,
      actions: [
        {
          type: 'sendMessage',
          chatId,
          text: content.messages.chooseMenu,
          replyMarkup: mainMenuMarkup(content),
        },
      ],
    };
  }

  if (!hasLinkedPhone) {
    await userPort.setUserState(String(channelUserId), 'await_contact:subscription');
    return {
      consumed: true,
      actions: [
        {
          type: 'sendMessage',
          chatId,
          text: content.messages.onboardingWelcome,
          replyMarkup: content.requestContactKeyboard,
        },
      ],
    };
  }

  await userPort.setUserState(String(channelUserId), 'idle');
  return {
    consumed: true,
    actions: [
      {
        type: 'sendMessage',
        chatId,
        text: content.messages.chooseMenu,
        replyMarkup: mainMenuMarkup(content),
      },
    ],
  };
}

export async function handleAsk(
  chatId: number,
  channelUserId: string,
  userPort: ChannelUserPort,
  content: WebhookContent,
  hasLinkedPhone: boolean,
): Promise<OutgoingAction[]> {
  if (!hasLinkedPhone) {
    return requestPhoneLink(chatId, channelUserId, userPort, content);
  }
  await userPort.setUserState(channelUserId, 'waiting_for_question');
  return [
    { type: 'sendMessage', chatId, text: content.messages.describeQuestion, replyMarkup: mainMenuMarkup(content) },
  ];
}

export async function handleQuestion(
  chatId: number,
  channelUserId: string,
  _text: string,
  userPort: ChannelUserPort,
  content: WebhookContent,
  adminForward: { chatId: number; text: string } | undefined,
): Promise<OutgoingAction[]> {
  await userPort.setUserState(channelUserId, 'idle');
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
  channelUserId: string,
  userPort: ChannelUserPort,
  content: WebhookContent,
): Promise<OutgoingAction[]> {
  await userPort.setUserState(channelUserId, 'idle');
  const bookingLinkMarkup = {
    inline_keyboard: [[{ text: content.messages.bookingOpenButton, url: content.bookingUrl }]],
  };
  return [
    {
      type: 'sendMessage',
      chatId,
      text: content.messages.bookingOpenPrompt,
      replyMarkup: bookingLinkMarkup,
    },
  ];
}

export async function handleMore(
  chatId: number,
  channelUserId: string,
  userPort: ChannelUserPort,
  content: WebhookContent,
  hasLinkedPhone: boolean,
): Promise<OutgoingAction[]> {
  if (!hasLinkedPhone) {
    return requestPhoneLink(chatId, channelUserId, userPort, content);
  }
  return [
    { type: 'sendMessage', chatId, text: content.messages.chooseMenu, replyMarkup: content.moreMenuInline },
  ];
}

export async function handleDefaultIdle(
  chatId: number,
  channelUserId: string,
  userPort: ChannelUserPort,
  content: WebhookContent,
  hasLinkedPhone: boolean,
): Promise<OutgoingAction[]> {
  if (!hasLinkedPhone) {
    return requestPhoneLink(chatId, channelUserId, userPort, content);
  }
  return [
    { type: 'sendMessage', chatId, text: content.messages.chooseMenu, replyMarkup: mainMenuMarkup(content) },
  ];
}
