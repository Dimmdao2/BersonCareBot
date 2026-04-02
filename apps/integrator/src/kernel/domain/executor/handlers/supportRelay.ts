/**
 * Support relay: user ↔ admin message forwarding with type policy and copy/send intents.
 * Isolated from executeAction; uses only helpers and template keys.
 */
import { randomUUID } from 'node:crypto';
import type { Action, ActionResult, DbWriteMutation, DomainContext, OutgoingIntent } from '../../../contracts/index.js';
import type { ExecutorDeps } from '../helpers.js';
import {
  asNumber,
  asRecord,
  asString,
  buildIntentMeta,
  formatActorLabel,
  persistWrites,
  readConversationId,
  readExternalActorId,
  readIncoming,
  readIncomingChatId,
  readIncomingMessageId,
  readIncomingText,
  readRelayMessageType,
  renderText,
} from '../helpers.js';
import { ADMIN, RELAY_USER } from '../templateKeys.js';

function channelDeliveryPayload(channel: string) {
  return { channels: [channel], maxAttempts: 1 };
}

function getUnsupportedUserRelayText(source: string): string {
  if (source === 'max') {
    return 'Пока для общения в MAX поддерживаются только текстовые сообщения. Скоро добавим пересылку других типов контента.';
  }
  return 'этот вид сообщений не поддерживается. Напишите ваш вопрос текстом.';
}

function getUnsupportedAdminRelayText(source: string): string {
  if (source === 'max') {
    return 'Пока для ответа пользователю в MAX поддерживается только текст. Скоро добавим пересылку других типов контента.';
  }
  return 'Такой тип сообщения нельзя переслать пользователю. Используйте текст, фото или документ.';
}

export async function handleConversationUserMessage(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps,
): Promise<ActionResult> {
  if (!deps.readPort) {
    return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
  }
  /** Reminder skip free-text must never be relayed to admin (S3.T07). Defense in depth if routing mis-orders scripts. */
  const convState = typeof ctx.base.conversationState === 'string' ? ctx.base.conversationState : '';
  if (convState.startsWith('waiting_skip_reason:')) {
    return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_USER_BLOCKED_SKIP_REASON' };
  }
  const externalId = readExternalActorId(ctx);
  const source = asString(action.params.source) ?? ctx.event.meta.source;
  const adminChannel = ctx.event.meta.source;
  const text = asString(action.params.text) ?? readIncomingText(ctx);
  const relayMessageType = readRelayMessageType(ctx) ?? 'text';
  if (!externalId || !source) {
    return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_USER_MESSAGE_INPUT_MISSING' };
  }
  if (relayMessageType === 'text' && !text) {
    return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_USER_MESSAGE_INPUT_MISSING' };
  }
  const conversation = await deps.readPort.readDb<Record<string, unknown> | null>({
    type: 'conversation.openByIdentity',
    params: {
      resource: ctx.event.meta.source,
      externalId,
      source,
    },
  });
  const conversationId = asString(conversation?.id);
  const adminChatId = asNumber(asRecord(ctx.base.facts).adminChatId);
  if (!conversationId || adminChatId === null) {
    return { actionId: action.id, status: 'skipped', error: 'OPEN_CONVERSATION_NOT_FOUND' };
  }
  const policy = deps.supportRelayPolicy;
  if (policy && !policy.isAllowedUserToAdmin(relayMessageType)) {
    const refusalChatId = asNumber(readIncoming(ctx).chatId);
    const refusalText = source !== 'max' && deps.templatePort
      ? (await renderText({ templateKey: RELAY_USER.UNSUPPORTED_TYPE, ctx, templatePort: deps.templatePort }))
        || getUnsupportedUserRelayText(source)
      : getUnsupportedUserRelayText(source);
    const refusalIntents: OutgoingIntent[] = refusalChatId !== null
      ? [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId: refusalChatId },
          message: { text: refusalText },
          delivery: channelDeliveryPayload(source),
        },
      }]
      : [];
    return { actionId: action.id, status: 'success', intents: refusalIntents };
  }
  const writes: DbWriteMutation[] = [
    {
      type: 'conversation.message.add',
      params: {
        id: randomUUID(),
        conversationId,
        senderRole: 'user',
        text: text ?? (relayMessageType !== 'text' ? `[${relayMessageType}]` : ''),
        source,
        externalChatId: readIncomingChatId(ctx),
        externalMessageId: readIncomingMessageId(ctx),
        createdAt: ctx.nowIso,
      },
    },
    {
      type: 'conversation.state.set',
      params: {
        id: conversationId,
        status: 'waiting_admin',
        lastMessageAt: ctx.nowIso,
      },
    },
  ];
  await persistWrites(deps.writePort, writes);

  let userLabel = formatActorLabel({
    firstName: asString(conversation?.first_name),
    lastName: asString(conversation?.last_name),
    username: asString(conversation?.username),
    channelId: asString(conversation?.user_channel_id),
  });
  if (source === 'max' && (!userLabel || userLabel === asString(conversation?.user_channel_id))) {
    const cid = asString(conversation?.user_channel_id);
    userLabel = cid ? `Пользователь (${cid})` : 'Пользователь';
  }
  const replyButtonText = deps.templatePort
    ? (await renderText({ templateKey: ADMIN.REPLY_BUTTON, ctx, templatePort: deps.templatePort })) || 'Ответить'
    : 'Ответить';
  const notificationOnlyText = `Новое сообщение в диалоге\nОт: ${userLabel}`;
  const incoming = readIncoming(ctx);
  const userChatId = asNumber(incoming.chatId);
  const userMessageIdRaw = readIncomingMessageId(ctx);
  const userMessageId = userMessageIdRaw !== null && Number.isFinite(Number(userMessageIdRaw)) ? Number(userMessageIdRaw) : null;
  const intents: OutgoingIntent[] = [];
  if (source === 'telegram' && userChatId !== null && userMessageId !== null) {
    intents.push({
      type: 'message.copy',
      meta: buildIntentMeta(action, ctx),
      payload: {
        recipient: { chatId: adminChatId },
        from_chat_id: userChatId,
        message_id: userMessageId,
        delivery: channelDeliveryPayload(adminChannel),
      },
    });
  } else if (relayMessageType === 'text' && text) {
    intents.push({
      type: 'message.send',
      meta: buildIntentMeta(action, ctx),
      payload: {
        recipient: { chatId: adminChatId },
        message: { text },
        delivery: channelDeliveryPayload(adminChannel),
      },
    });
  }
  intents.push({
    type: 'message.send',
    meta: buildIntentMeta(action, ctx),
    payload: {
      recipient: { chatId: adminChatId },
      message: { text: notificationOnlyText },
      replyMarkup: {
        inline_keyboard: [[
          { text: replyButtonText, callback_data: `admin_reply:${conversationId}` },
        ]],
      },
      delivery: channelDeliveryPayload(adminChannel),
    },
  });
  return {
    actionId: action.id,
    status: 'success',
    writes,
    intents,
    values: {
      hasOpenConversation: true,
      activeConversationId: conversationId,
      activeConversationStatus: 'waiting_admin',
    },
  };
}

export async function handleConversationAdminReply(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps,
): Promise<ActionResult> {
  if (!deps.readPort) {
    return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
  }
  const conversationId = readConversationId(action, ctx);
  const relayMessageType = readRelayMessageType(ctx) ?? 'text';
  const text = asString(action.params.text) ?? readIncomingText(ctx);
  const adminChannel = ctx.event.meta.source;
  const adminChatId = asNumber(readIncoming(ctx).chatId);
  const rawMsgId = readIncomingMessageId(ctx);
  const adminMessageIdFinite =
    rawMsgId !== null && Number.isFinite(Number(rawMsgId)) ? Number(rawMsgId) : null;
  if (!conversationId) {
    return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_ADMIN_REPLY_INPUT_MISSING' };
  }
  const isTextReply = relayMessageType === 'text' || !relayMessageType;
  if (isTextReply && !text) {
    return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_ADMIN_REPLY_INPUT_MISSING' };
  }
  if (!isTextReply && adminMessageIdFinite === null) {
    return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_ADMIN_REPLY_INPUT_MISSING' };
  }
  const conversation = await deps.readPort.readDb<Record<string, unknown> | null>({
    type: 'conversation.byId',
    params: { id: conversationId },
  });
  const sourceForConversation = asString(conversation?.source) ?? ctx.event.meta.source;
  const userChatIdRaw = asString(conversation?.user_chat_id) || asString(conversation?.user_channel_id);
  const userChatId = userChatIdRaw ? Number(userChatIdRaw) : Number.NaN;
  if (!conversation || !Number.isFinite(userChatId)) {
    return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_NOT_FOUND' };
  }
  const policy = deps.supportRelayPolicy;
  if (policy && !policy.isAllowedAdminToUser(relayMessageType)) {
    const refusalText = sourceForConversation !== 'max' && deps.templatePort
      ? (await renderText({ templateKey: ADMIN.RELAY_UNSUPPORTED_ADMIN, ctx, templatePort: deps.templatePort }))
        || getUnsupportedAdminRelayText(sourceForConversation)
      : getUnsupportedAdminRelayText(sourceForConversation);
    const refusalIntents: OutgoingIntent[] = adminChatId !== null
      ? [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId: adminChatId },
          message: { text: refusalText },
          delivery: channelDeliveryPayload(adminChannel),
        },
      }]
      : [];
    return { actionId: action.id, status: 'success', intents: refusalIntents };
  }
  const messageTextForDb = isTextReply ? (text ?? '') : `[${relayMessageType}]`;
  const writes: DbWriteMutation[] = [
    {
      type: 'conversation.message.add',
      params: {
        id: randomUUID(),
        conversationId,
        senderRole: 'admin',
        text: messageTextForDb,
        source: sourceForConversation,
        externalChatId: readIncomingChatId(ctx),
        externalMessageId: readIncomingMessageId(ctx),
        createdAt: ctx.nowIso,
      },
    },
    {
      type: 'conversation.state.set',
      params: {
        id: conversationId,
        status: 'waiting_user',
        lastMessageAt: ctx.nowIso,
      },
    },
  ];
  await persistWrites(deps.writePort, writes);

  const question = await deps.readPort.readDb<{ id: string; answered: boolean } | null>({
    type: 'question.byConversationId',
    params: { conversationId },
  });
  if (question?.id && question.answered === false && deps.writePort) {
    const questionReplyWrites: DbWriteMutation[] = [
      {
        type: 'question.message.add',
        params: {
          id: randomUUID(),
          questionId: question.id,
          senderType: 'admin',
          messageText: messageTextForDb,
          createdAt: ctx.nowIso,
        },
      },
      {
        type: 'question.markAnswered',
        params: { questionId: question.id, answeredAt: ctx.nowIso },
      },
    ];
    await persistWrites(deps.writePort, questionReplyWrites);
    writes.push(...questionReplyWrites);
  }

  const intents: OutgoingIntent[] = [];
  if (isTextReply && text) {
    intents.push({
      type: 'message.send',
      meta: buildIntentMeta(action, ctx),
      payload: {
        recipient: { chatId: userChatId },
        message: { text },
        delivery: channelDeliveryPayload(sourceForConversation),
      },
    });
  } else if (
    !isTextReply &&
    adminChannel === 'telegram' &&
    sourceForConversation === 'telegram' &&
    adminChatId !== null &&
    adminMessageIdFinite !== null
  ) {
    intents.push({
      type: 'message.copy',
      meta: buildIntentMeta(action, ctx),
      payload: {
        recipient: { chatId: userChatId },
        from_chat_id: adminChatId,
        message_id: adminMessageIdFinite,
        delivery: channelDeliveryPayload(sourceForConversation),
      },
    });
  }
  if (adminChatId !== null) {
    const sentText = deps.templatePort
      ? (await renderText({ templateKey: ADMIN.REPLY_SENT, ctx, templatePort: deps.templatePort })) || 'Сообщение отправлено.'
      : 'Сообщение отправлено.';
    const continueButtonText = deps.templatePort
      ? (await renderText({ templateKey: ADMIN.REPLY_CONTINUE_BUTTON, ctx, templatePort: deps.templatePort })) || 'Дополнить ответ'
      : 'Дополнить ответ';
    const closeButtonText = deps.templatePort
      ? (await renderText({ templateKey: ADMIN.DIALOG_CLOSE_BUTTON, ctx, templatePort: deps.templatePort }))?.trim() ?? ''
      : '';
    const replyRows: Array<Array<{ text: string; callback_data: string }>> = [
      [{ text: continueButtonText, callback_data: `admin_reply_continue:${conversationId}` }],
    ];
    if (closeButtonText) {
      replyRows.push([{ text: closeButtonText, callback_data: `admin_close_dialog:${conversationId}` }]);
    }
    intents.push({
      type: 'message.send',
      meta: buildIntentMeta(action, ctx),
      payload: {
        recipient: { chatId: adminChatId },
        message: { text: sentText },
        replyMarkup: { inline_keyboard: replyRows },
        delivery: channelDeliveryPayload(adminChannel),
      },
    });
  }
  return {
    actionId: action.id,
    status: 'success',
    writes,
    intents,
    values: {
      hasOpenConversation: true,
      activeConversationId: conversationId,
      activeConversationStatus: 'waiting_user',
    },
  };
}
