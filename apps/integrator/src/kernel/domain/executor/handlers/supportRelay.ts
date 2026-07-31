/**
 * Support relay: user ↔ admin message forwarding with type policy and copy/send intents.
 * Isolated from executeAction; uses only helpers and template keys.
 */
import { randomUUID } from 'node:crypto';
import type {
  Action,
  ActionResult,
  DbWriteMutation,
  DomainContext,
  OutgoingIntent,
} from '../../../contracts/index.js';
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
import { maxUserRecipient } from '../../../../integrations/max/maxRecipient.js';
import { isWebappPlatformConversationId } from '../../../../shared/support/platformConversationId.js';
import { webappPlatformConversationId } from '../../../../shared/support/platformConversationId.js';
import {
  applyWebappAdminReplyFromMessenger,
  mirrorPatientUserMessageToWebapp,
  resolvePlatformUserIdForChannel,
} from '../../support/webappSupportSync.js';
import { buildProgramNoteReplyState } from '../../../../shared/support/programNoteReplyState.js';

function resolvePatientMessengerRecipient(
  source: string,
  conversation: Record<string, unknown>,
): Record<string, unknown> | null {
  if (source === 'max') {
    const channelUserId = asString(conversation.user_channel_id);
    if (!channelUserId) return null;
    return maxUserRecipient(channelUserId);
  }
  const userChatIdRaw =
    asString(conversation.user_chat_id) || asString(conversation.user_channel_id);
  const userChatId = userChatIdRaw ? Number(userChatIdRaw) : Number.NaN;
  if (!Number.isFinite(userChatId)) return null;
  return { chatId: userChatId };
}

function channelDeliveryPayload(channel: string) {
  return { channels: [channel], maxAttempts: 1 };
}

function isSafePersonalChatDisplayName(value: string): boolean {
  return /^[\p{L}\p{M}](?:[\p{L}\p{M}'’ -]*[\p{L}\p{M}])?$/u.test(value);
}

export function buildDoctorPatientMessageNotificationText(input: {
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  displayName?: string | null | undefined;
}): string {
  const structuredName = [input.firstName, input.lastName]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const candidate = structuredName || input.displayName?.replace(/\s+/g, ' ').trim() || '';
  const displayName = isSafePersonalChatDisplayName(candidate) ? candidate : 'пациента';
  return `новое сообщение от ${displayName}`;
}

export async function buildDoctorPatientMessageNotificationIntents(input: {
  action: Action;
  ctx: DomainContext;
  deps: ExecutorDeps;
  source: string;
  externalId: string;
  conversationId: string;
  integratorMessageId: string;
  messageText: string;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  username?: string | null | undefined;
  channelId?: string | null | undefined;
  webappSync?: Awaited<ReturnType<typeof mirrorPatientUserMessageToWebapp>>;
}): Promise<OutgoingIntent[]> {
  const { action, ctx, deps, source, externalId, conversationId, integratorMessageId } = input;
  const platformUserId = await resolvePlatformUserIdForChannel(deps, source, externalId);
  const messageText = input.messageText.trim();
  const webappSync =
    input.webappSync ??
    (platformUserId && messageText
      ? await mirrorPatientUserMessageToWebapp(deps, {
          platformUserId,
          integratorMessageId,
          text: messageText,
          source,
          createdAt: ctx.nowIso,
        })
      : { mirrored: false });
  const platformConversationKey =
    webappSync.canonicalWrite?.conversationId ??
    (platformUserId ? webappPlatformConversationId(platformUserId) : null);
  if (
    platformUserId &&
    platformConversationKey &&
    platformConversationKey !== conversationId &&
    deps.writePort
  ) {
    await persistWrites(deps.writePort, [
      {
        type: 'conversation.mergeLegacyToPlatform',
        params: {
          platformConversationId: platformConversationKey,
          legacyConversationId: conversationId,
          resource: source,
          externalId,
        },
      },
    ]);
  }

  if (webappSync.mirrored) {
    // The webapp notification path owns sender-name resolution, the safety gate,
    // the doctor-conversation deep link, and the Reply affordance.
    return [];
  }

  const adminChatId = asNumber(asRecord(ctx.base.facts).adminChatId);
  if (adminChatId === null) return [];
  const fallbackLabel = formatActorLabel({
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    username: input.username ?? null,
    channelId: input.channelId ?? null,
  });
  const notificationText = buildDoctorPatientMessageNotificationText({
    firstName: input.firstName,
    lastName: input.lastName,
    displayName: fallbackLabel,
  });
  const replyButtonText = deps.templatePort
    ? (await renderText({
        templateKey: ADMIN.REPLY_BUTTON,
        ctx,
        templatePort: deps.templatePort,
      })) || 'Ответить'
    : 'Ответить';
  return [
    {
      type: 'message.send',
      meta: buildIntentMeta(action, ctx),
      payload: {
        recipient: { chatId: adminChatId },
        message: { text: notificationText },
        replyMarkup: {
          inline_keyboard: [
            [{ text: replyButtonText, callback_data: `admin_reply:${conversationId}` }],
          ],
        },
        delivery: channelDeliveryPayload(ctx.event.meta.source),
      },
    },
  ];
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

function adminContinueCallbackData(
  conversationId: string,
  programNoteStageItemId: string | null,
): string {
  if (programNoteStageItemId) {
    return `program_reply:${programNoteStageItemId}`;
  }
  // `admin_reply:` keeps callback_data within Telegram 64-byte limit for `webapp:platform:{uuid}` ids.
  return `admin_reply:${conversationId}`;
}

async function persistAdminMessengerUserState(
  deps: ExecutorDeps,
  ctx: DomainContext,
  state: string,
): Promise<DbWriteMutation[]> {
  const channelUserId = readExternalActorId(ctx);
  const resource = ctx.event.meta.source;
  if (!channelUserId || !resource || !deps.writePort) return [];
  const writes: DbWriteMutation[] = [
    {
      type: 'user.state.set',
      params: { resource, channelUserId, state },
    },
  ];
  await persistWrites(deps.writePort, writes);
  return writes;
}

export async function handleConversationUserMessage(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps,
): Promise<ActionResult> {
  if (!deps.readPort) {
    return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
  }
  const externalId = readExternalActorId(ctx);
  const source = asString(action.params.source) ?? ctx.event.meta.source;
  const explicitText = asString(action.params.text);
  const text = explicitText ?? readIncomingText(ctx);
  const relayMessageType = readRelayMessageType(ctx) ?? 'text';
  const effectiveRelayType = explicitText !== null ? 'text' : relayMessageType;
  if (!externalId || !source) {
    return {
      actionId: action.id,
      status: 'skipped',
      error: 'CONVERSATION_USER_MESSAGE_INPUT_MISSING',
    };
  }
  if (effectiveRelayType === 'text' && !text) {
    return {
      actionId: action.id,
      status: 'skipped',
      error: 'CONVERSATION_USER_MESSAGE_INPUT_MISSING',
    };
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
  if (policy && !policy.isAllowedUserToAdmin(effectiveRelayType)) {
    const refusalChatId = asNumber(readIncoming(ctx).chatId);
    const refusalText =
      source !== 'max' && deps.templatePort
        ? (await renderText({
            templateKey: RELAY_USER.UNSUPPORTED_TYPE,
            ctx,
            templatePort: deps.templatePort,
          })) || getUnsupportedUserRelayText(source)
        : getUnsupportedUserRelayText(source);
    const refusalIntents: OutgoingIntent[] =
      refusalChatId !== null
        ? [
            {
              type: 'message.send',
              meta: buildIntentMeta(action, ctx),
              payload: {
                recipient: { chatId: refusalChatId },
                message: { text: refusalText },
                delivery: channelDeliveryPayload(source),
              },
            },
          ]
        : [];
    return { actionId: action.id, status: 'success', intents: refusalIntents };
  }
  const integratorMessageId = randomUUID();
  const platformUserId = await resolvePlatformUserIdForChannel(deps, source, externalId);
  const externalChatId = asString(action.params.externalChatId) ?? readIncomingChatId(ctx);
  const externalMessageId = asString(action.params.externalMessageId) ?? readIncomingMessageId(ctx);
  const webappSync =
    platformUserId && text
      ? await mirrorPatientUserMessageToWebapp(deps, {
          platformUserId,
          integratorMessageId,
          text,
          source,
          createdAt: ctx.nowIso,
          externalChatId,
          externalMessageId,
        })
      : { mirrored: false };
  const effectiveConversationId = webappSync.canonicalWrite?.conversationId ?? conversationId;
  if (effectiveConversationId !== conversationId && deps.writePort) {
    await persistWrites(deps.writePort, [
      {
        type: 'conversation.mergeLegacyToPlatform',
        params: {
          platformConversationId: effectiveConversationId,
          legacyConversationId: conversationId,
          resource: source,
          externalId,
        },
      },
    ]);
  }
  const canonicalWriteHandled = Boolean(webappSync.canonicalWrite);
  const writes: DbWriteMutation[] = [
    {
      type: 'conversation.message.add',
      params: {
        id: integratorMessageId,
        conversationId: effectiveConversationId,
        senderRole: 'user',
        text: text ?? (effectiveRelayType !== 'text' ? `[${effectiveRelayType}]` : ''),
        source,
        externalChatId,
        externalMessageId,
        createdAt: ctx.nowIso,
        canonicalWriteHandled,
      },
    },
    {
      type: 'conversation.state.set',
      params: {
        id: effectiveConversationId,
        status: 'waiting_admin',
        lastMessageAt: ctx.nowIso,
        canonicalWriteHandled,
      },
    },
  ];
  await persistWrites(deps.writePort, writes);

  const intents = await buildDoctorPatientMessageNotificationIntents({
    action,
    ctx,
    deps,
    source,
    externalId,
    conversationId: effectiveConversationId,
    integratorMessageId,
    messageText: text ?? '',
    firstName: asString(conversation?.first_name),
    lastName: asString(conversation?.last_name),
    username: asString(conversation?.username),
    channelId: asString(conversation?.user_channel_id),
    webappSync,
  });
  return {
    actionId: action.id,
    status: 'success',
    writes,
    intents,
    values: {
      hasOpenConversation: true,
      activeConversationId: effectiveConversationId,
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
    return {
      actionId: action.id,
      status: 'skipped',
      error: 'CONVERSATION_ADMIN_REPLY_INPUT_MISSING',
    };
  }
  const isTextReply = relayMessageType === 'text' || !relayMessageType;
  if (isTextReply && !text) {
    return {
      actionId: action.id,
      status: 'skipped',
      error: 'CONVERSATION_ADMIN_REPLY_INPUT_MISSING',
    };
  }
  if (!isTextReply && adminMessageIdFinite === null) {
    return {
      actionId: action.id,
      status: 'skipped',
      error: 'CONVERSATION_ADMIN_REPLY_INPUT_MISSING',
    };
  }

  if (isWebappPlatformConversationId(conversationId)) {
    if (!isTextReply || !text) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'CONVERSATION_ADMIN_REPLY_WEBAPP_TEXT_ONLY',
      };
    }
    const programNoteStageItemId =
      typeof ctx.base.programNoteStageItemId === 'string' && ctx.base.programNoteStageItemId.trim()
        ? ctx.base.programNoteStageItemId.trim()
        : null;
    const incoming = readIncoming(ctx);
    const senderDisplayName =
      [asString(incoming.channelFirstName), asString(incoming.channelLastName)]
        .filter((part): part is string => Boolean(part))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim() || undefined;
    const applyResult = await applyWebappAdminReplyFromMessenger(deps, {
      integratorConversationId: conversationId,
      text,
      ...(senderDisplayName ? { senderDisplayName } : {}),
      createdAt: ctx.nowIso,
      adminMessageId: readIncomingMessageId(ctx),
      programNoteStageItemId,
    });
    const intents: OutgoingIntent[] = [];
    if (!applyResult.ok && adminChatId !== null) {
      intents.push({
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId: adminChatId },
          message: {
            text: 'Не удалось отправить ответ в чат приложения. Попробуйте в кабинете врача.',
          },
          delivery: channelDeliveryPayload(adminChannel),
        },
      });
      return { actionId: action.id, status: 'success', intents };
    }
    const writes: DbWriteMutation[] = [];
    const nextAdminState = programNoteStageItemId
      ? buildProgramNoteReplyState(conversationId, programNoteStageItemId)
      : 'idle';
    writes.push(...(await persistAdminMessengerUserState(deps, ctx, nextAdminState)));
    if (adminChatId !== null) {
      const sentText = deps.templatePort
        ? (await renderText({
            templateKey: ADMIN.REPLY_SENT,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Сообщение отправлено.'
        : 'Сообщение отправлено.';
      const continueButtonText = deps.templatePort
        ? (await renderText({
            templateKey: ADMIN.REPLY_CONTINUE_BUTTON,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Дополнить ответ'
        : 'Дополнить ответ';
      const closeButtonText = deps.templatePort
        ? ((
            await renderText({
              templateKey: ADMIN.DIALOG_CLOSE_BUTTON,
              ctx,
              templatePort: deps.templatePort,
            })
          )?.trim() ?? '')
        : '';
      const replyRows: Array<Array<{ text: string; callback_data: string }>> = [
        [
          {
            text: continueButtonText,
            callback_data: adminContinueCallbackData(conversationId, programNoteStageItemId),
          },
        ],
      ];
      if (closeButtonText) {
        replyRows.push([
          { text: closeButtonText, callback_data: `admin_close_dialog:${conversationId}` },
        ]);
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

  const conversation = await deps.readPort.readDb<Record<string, unknown> | null>({
    type: 'conversation.byId',
    params: { id: conversationId },
  });
  const sourceForConversation = asString(conversation?.source) ?? ctx.event.meta.source;
  const patientRecipient = conversation
    ? resolvePatientMessengerRecipient(sourceForConversation, conversation)
    : null;
  if (!conversation || !patientRecipient) {
    return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_NOT_FOUND' };
  }
  const policy = deps.supportRelayPolicy;
  if (policy && !policy.isAllowedAdminToUser(relayMessageType)) {
    const refusalText =
      sourceForConversation !== 'max' && deps.templatePort
        ? (await renderText({
            templateKey: ADMIN.RELAY_UNSUPPORTED_ADMIN,
            ctx,
            templatePort: deps.templatePort,
          })) || getUnsupportedAdminRelayText(sourceForConversation)
        : getUnsupportedAdminRelayText(sourceForConversation);
    const refusalIntents: OutgoingIntent[] =
      adminChatId !== null
        ? [
            {
              type: 'message.send',
              meta: buildIntentMeta(action, ctx),
              payload: {
                recipient: { chatId: adminChatId },
                message: { text: refusalText },
                delivery: channelDeliveryPayload(adminChannel),
              },
            },
          ]
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
          conversationId,
          senderType: 'admin',
          messageText: messageTextForDb,
          createdAt: ctx.nowIso,
        },
      },
      {
        type: 'question.markAnswered',
        params: { questionId: question.id, conversationId, answeredAt: ctx.nowIso },
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
        recipient: patientRecipient,
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
        recipient: patientRecipient,
        from_chat_id: adminChatId,
        message_id: adminMessageIdFinite,
        delivery: channelDeliveryPayload(sourceForConversation),
      },
    });
  }
  writes.push(...(await persistAdminMessengerUserState(deps, ctx, 'idle')));
  if (adminChatId !== null) {
    const sentText = deps.templatePort
      ? (await renderText({
          templateKey: ADMIN.REPLY_SENT,
          ctx,
          templatePort: deps.templatePort,
        })) || 'Сообщение отправлено.'
      : 'Сообщение отправлено.';
    const continueButtonText = deps.templatePort
      ? (await renderText({
          templateKey: ADMIN.REPLY_CONTINUE_BUTTON,
          ctx,
          templatePort: deps.templatePort,
        })) || 'Дополнить ответ'
      : 'Дополнить ответ';
    const closeButtonText = deps.templatePort
      ? ((
          await renderText({
            templateKey: ADMIN.DIALOG_CLOSE_BUTTON,
            ctx,
            templatePort: deps.templatePort,
          })
        )?.trim() ?? '')
      : '';
    const replyRows: Array<Array<{ text: string; callback_data: string }>> = [
      [
        {
          text: continueButtonText,
          callback_data: adminContinueCallbackData(conversationId, null),
        },
      ],
    ];
    if (closeButtonText) {
      replyRows.push([
        { text: closeButtonText, callback_data: `admin_close_dialog:${conversationId}` },
      ]);
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
