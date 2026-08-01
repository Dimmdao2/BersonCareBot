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
import { isWebappPlatformConversationId } from '../../../../shared/support/platformConversationId.js';
import { webappPlatformConversationId } from '../../../../shared/support/platformConversationId.js';
import {
  applyWebappAdminReplyFromMessenger,
  mirrorPatientUserMessageToWebapp,
  resolvePlatformUserIdForChannel,
} from '../../support/webappSupportSync.js';
import { buildProgramNoteReplyState } from '../../../../shared/support/programNoteReplyState.js';

function channelDeliveryPayload(channel: string) {
  return { channels: [channel], maxAttempts: 1 };
}

/**
 * Merges a legacy conversation into its platform conversation once the sender's platformUserId
 * resolves. Notification is now owned entirely by webapp (D23: the bot-side admin fallback and
 * its Reply affordance were removed with the legacy admin-reply branch).
 */
export async function buildDoctorPatientMessageNotificationIntents(input: {
  ctx: DomainContext;
  deps: ExecutorDeps;
  source: string;
  externalId: string;
  conversationId: string;
  integratorMessageId: string;
  messageText: string;
  webappSync?: Awaited<ReturnType<typeof mirrorPatientUserMessageToWebapp>>;
}): Promise<OutgoingIntent[]> {
  const { ctx, deps, source, externalId, conversationId, integratorMessageId } = input;
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

  // The webapp notification path owns sender-name resolution, the safety gate, the
  // doctor-conversation deep link, and the Reply affordance — nothing left to notify here
  // when the mirror to webapp didn't happen (there is no bot-side reply flow to offer any more).
  return [];
}

function getUnsupportedUserRelayText(source: string): string {
  if (source === 'max') {
    return 'Пока для общения в MAX поддерживаются только текстовые сообщения. Скоро добавим пересылку других типов контента.';
  }
  return 'этот вид сообщений не поддерживается. Напишите ваш вопрос текстом.';
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
    ctx,
    deps,
    source,
    externalId,
    conversationId: effectiveConversationId,
    integratorMessageId,
    messageText: text ?? '',
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

  // D23: the legacy (non-webapp) admin-reply branch was removed — replying to a support
  // conversation with no linked platform account, and the bot admin console around it, are gone
  // with no replacement built. Conversation ids in that shape can only be pre-existing open
  // threads from before this cut; they are left as-is (schema/tables untouched), just no longer
  // reachable through this action.
  return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_ADMIN_REPLY_LEGACY_REMOVED' };
}
