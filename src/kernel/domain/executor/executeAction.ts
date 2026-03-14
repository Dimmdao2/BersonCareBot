import { randomUUID } from 'node:crypto';
import type {
  Action,
  ActionResult,
  ContentCatalogPort,
  DbWriteMutation,
  DomainContext,
  NotificationSettings,
  OutgoingIntent,
} from '../../contracts/index.js';
import type { DueReminderOccurrence, ReminderCategory, ReminderRuleRecord } from '../../contracts/reminders.js';
import {
  buildDefaultReminderRule,
  cycleReminderPreset,
  detectReminderPreset,
  reminderPresetConfig,
} from '../reminders/policy.js';
import { handleBooking } from './handlers/booking.js';
import { handleDelivery } from './handlers/delivery.js';
import { handleNotifications } from './handlers/notifications.js';
import { handleReminders } from './handlers/reminders.js';
import {
  type ExecutorDeps,
  asRecord,
  asString,
  asNumber,
  asNumericString,
  asStringArray,
  readIncoming,
  readIncomingText,
  readIncomingChatId,
  readIncomingMessageId,
  readConversationId,
  readExternalActorId,
  readIncomingPhone,
  formatActorLabel,
  nowIso,
  buildIntentMeta,
  buildDeliveryJob,
  buildMessageDeliverJob,
  renderText,
  buildReplyMarkup,
  resolveGenericMessageParams,
  persistWrites,
  contentAudience,
  defaultNotificationSettings,
  readNotificationSettings,
  sendAdminMessage,
} from './helpers.js';
import { applyMessageSendDeliveryPolicy } from './deliveryPolicy.js';
import { ADMIN, REMINDER_BY_CATEGORY } from './templateKeys.js';

const BOOKING_TYPES = new Set<string>(['booking.upsert', 'booking.event.insert']);
const NOTIFICATION_TYPES = new Set<string>(['notifications.get', 'notifications.toggle']);
const REMINDER_TYPES = new Set<string>(['reminders.rules.get', 'reminders.rule.toggle', 'reminders.rule.cyclePreset', 'reminders.dispatchDue']);
const DELIVERY_TYPES = new Set<string>([
  'message.compose', 'message.send', 'message.edit', 'message.replyMarkup.edit',
  'callback.answer', 'message.deliver', 'message.retry.enqueue', 'intent.enqueueDelivery',
]);


export async function executeAction(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps = {},
): Promise<ActionResult> {
  const fullDeps: ExecutorDeps = { ...deps, executeAction };
  if (BOOKING_TYPES.has(action.type)) return handleBooking(action, ctx, fullDeps);
  if (NOTIFICATION_TYPES.has(action.type)) return handleNotifications(action, ctx, fullDeps);
  if (REMINDER_TYPES.has(action.type)) return handleReminders(action, ctx, fullDeps);
  if (DELIVERY_TYPES.has(action.type)) return handleDelivery(action, ctx, fullDeps);

  switch (action.type) {
    case 'event.log': {
      const writes: DbWriteMutation[] = [{ type: 'event.log', params: action.params }];
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes };
    }

    case 'booking.upsert': {
      const writes: DbWriteMutation[] = [{ type: 'booking.upsert', params: action.params }];
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes };
    }

    case 'booking.event.insert': {
      const writes: DbWriteMutation[] = [{
        type: 'event.log',
        params: {
          source: ctx.event.meta.source,
          eventType: ctx.event.type,
          eventId: ctx.event.meta.eventId,
          occurredAt: ctx.event.meta.occurredAt,
          body: action.params,
        },
      }];
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes };
    }

    case 'message.compose': {
      const source = typeof action.params.source === 'string' ? action.params.source : ctx.event.meta.source;
      const templateId = typeof action.params.templateId === 'string' ? action.params.templateId : '';
      const vars = typeof action.params.vars === 'object' && action.params.vars !== null
        ? action.params.vars as Record<string, unknown>
        : {};
      const recipient = typeof action.params.recipient === 'object' && action.params.recipient !== null
        ? action.params.recipient as Record<string, unknown>
        : {};
      const delivery = typeof action.params.delivery === 'object' && action.params.delivery !== null
        ? action.params.delivery as Record<string, unknown>
        : { maxAttempts: 1 };

      const composedText = deps.templatePort && templateId
        ? (await deps.templatePort.renderTemplate({
          source,
          templateId,
          vars,
          audience: contentAudience(ctx),
        })).text
        : (typeof action.params.text === 'string' ? action.params.text : '');

      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: {
          eventId: `${ctx.event.meta.eventId}:intent:${action.id}`,
          occurredAt: nowIso(ctx),
          source: ctx.event.meta.source,
          ...(ctx.event.meta.correlationId ? { correlationId: ctx.event.meta.correlationId } : {}),
          ...(ctx.event.meta.userId ? { userId: ctx.event.meta.userId } : {}),
        },
        payload: {
          recipient,
          message: { text: composedText },
          delivery,
        },
      }];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'message.send': {
      const policyParams = await applyMessageSendDeliveryPolicy(
        action.params,
        ctx,
        deps.deliveryDefaultsPort,
      );
      const resolvedParams = await resolveGenericMessageParams({
        params: policyParams,
        ctx,
        templatePort: deps.templatePort,
      });
      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: resolvedParams,
      }];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'message.replyKeyboard.show':
    case 'message.inlineKeyboard.show':
    case 'admin.forward': {
      const rawVars = (action.params.vars ?? {}) as Record<string, unknown>;
      const username = typeof rawVars.username === 'string' ? rawVars.username.trim() : '';
      const vars = {
        ...rawVars,
        usernameMention: username ? `@${username}` : '',
      };
      const text = await renderText({
        text: action.params.text,
        messageText: action.params.messageText,
        templateKey: action.params.templateKey,
        vars,
        ctx,
        templatePort: deps.templatePort,
      });
      const replyMarkup = await buildReplyMarkup({
        params: action.params,
        vars: action.params.vars,
        ctx,
        templatePort: deps.templatePort,
      });
      const chatId = asNumber(action.params.chatId);
      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: chatId === null ? {} : { chatId },
          message: { text },
          ...(replyMarkup ? { replyMarkup } : {}),
          delivery: { maxAttempts: 1 },
        },
      }];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'message.edit': {
      const text = await renderText({
        text: action.params.text,
        messageText: action.params.messageText,
        templateKey: action.params.templateKey,
        vars: action.params.vars,
        ctx,
        templatePort: deps.templatePort,
      });
      const replyMarkup = await buildReplyMarkup({
        params: action.params,
        vars: action.params.vars,
        ctx,
        templatePort: deps.templatePort,
      });
      const chatId = asNumber(action.params.chatId);
      const messageId = asNumber(action.params.messageId);
      const intents: OutgoingIntent[] = [{
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: chatId === null ? {} : { chatId },
          ...(messageId === null ? {} : { messageId }),
          message: { text },
          ...(replyMarkup ? { replyMarkup } : {}),
        },
      }];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'message.replyMarkup.edit': {
      const chatId = asNumber(action.params.chatId);
      const messageId = asNumber(action.params.messageId);
      const replyMarkup = await buildReplyMarkup({
        params: action.params,
        vars: action.params.vars,
        ctx,
        templatePort: deps.templatePort,
      });
      const intents: OutgoingIntent[] = [{
        type: 'message.replyMarkup.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: chatId === null ? {} : { chatId },
          ...(messageId === null ? {} : { messageId }),
          ...(replyMarkup ? { replyMarkup } : {}),
        },
      }];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'callback.answer': {
      const callbackQueryId = asString(action.params.callbackQueryId);
      const intents: OutgoingIntent[] = callbackQueryId ? [{
        type: 'callback.answer',
        meta: buildIntentMeta(action, ctx),
        payload: { callbackQueryId },
      }] : [];
      return { actionId: action.id, status: 'success', ...(intents.length > 0 ? { intents } : {}) };
    }

    case 'message.deliver': {
      const job = await buildMessageDeliverJob({
        action,
        ctx,
        ...(deps.readPort ? { readPort: deps.readPort } : {}),
        ...(deps.deliveryDefaultsPort !== undefined ? { deliveryDefaultsPort: deps.deliveryDefaultsPort } : {}),
      });
      if (deps.queuePort) {
        await deps.queuePort.enqueue({ kind: job.kind, payload: job.payload });
      }
      const payloadIntent = asRecord(job.payload.intent);
      const payloadDelivery = asRecord(asRecord(payloadIntent.payload).delivery);
      const channels = asStringArray(payloadDelivery.channels);
      return {
        actionId: action.id,
        status: 'queued',
        jobs: [{
          ...job,
          jobId: job.id,
          createdAt: ctx.nowIso,
          status: 'pending',
          attemptsMade: 0,
          plan: channels.map((channel, index) => ({
            stageId: `stage:${index + 1}`,
            channel,
            maxAttempts: 1,
          })),
          targets: Array.isArray(job.payload.targets) ? job.payload.targets as Array<{ resource: string; address: Record<string, unknown> }> : [],
          retry: asRecord(job.payload.retry) as { maxAttempts: number; backoffSeconds: number[]; deadlineAt?: string },
          onFail: asRecord(job.payload.onFail) as { adminNotifyIntent?: OutgoingIntent },
        }],
      };
    }

    case 'message.retry.enqueue': {
      const mappedAction: Action = {
        id: action.id,
        type: 'message.deliver',
        mode: action.mode,
        params: {
          recipient: {
            phoneNormalized: action.params.phoneNormalized,
          },
          messageText: action.params.messageText,
          delivery: action.params.delivery,
          retry: {
            maxAttempts: action.params.maxAttempts,
            backoffSeconds: [action.params.firstTryDelaySeconds],
          },
        },
      };
      const mappedResult = await executeAction(mappedAction, ctx, deps);
      const writes: DbWriteMutation[] = [{
        type: 'message.retry.enqueue',
        params: action.params,
      }];
      await persistWrites(deps.writePort, writes);
      const result: ActionResult = {
        actionId: action.id,
        status: mappedResult.status,
        writes,
        ...(mappedResult.jobs ? { jobs: mappedResult.jobs } : {}),
        ...(mappedResult.intents ? { intents: mappedResult.intents } : {}),
      };
      return {
        ...result,
      };
    }

    case 'intent.enqueueDelivery': {
      const job = buildDeliveryJob({ actionId: action.id, params: action.params, now: nowIso(ctx) });
      if (deps.queuePort) {
        await deps.queuePort.enqueue({ kind: job.kind, payload: job.payload });
      }
      return { actionId: action.id, status: 'queued', jobs: [job] };
    }

    case 'user.findByPhone': {
      const phone = typeof action.params.phoneNormalized === 'string' ? action.params.phoneNormalized : null;
      if (deps.readPort && phone) {
        await deps.readPort.readDb({ type: 'user.byPhone', params: { phoneNormalized: phone } });
      }
      return { actionId: action.id, status: 'success' };
    }

    case 'user.state.set': {
      const writes: DbWriteMutation[] = [{
        type: 'user.state.set',
        params: {
          resource: ctx.event.meta.source,
          channelUserId: action.params.channelUserId ?? action.params.channelId ?? readExternalActorId(ctx),
          state: action.params.state ?? null,
        },
      }];
      await persistWrites(deps.writePort, writes);
      return {
        actionId: action.id,
        status: 'success',
        writes,
        ...(typeof action.params.state === 'string' ? { values: { userState: action.params.state } } : {}),
      };
    }

    case 'user.phone.link': {
      const channelUserId = action.params.channelUserId ?? action.params.channelId ?? readExternalActorId(ctx);
      const phoneNormalized = asString(action.params.phoneNormalized) ?? readIncomingPhone(ctx);
      const writes: DbWriteMutation[] = phoneNormalized ? [{
        type: 'user.phone.link',
        params: {
          resource: ctx.event.meta.source,
          channelUserId,
          phoneNormalized,
        },
      }] : [];
      await persistWrites(deps.writePort, writes);
      return {
        actionId: action.id,
        status: 'success',
        ...(writes.length > 0 ? { writes } : {}),
      };
    }

    case 'draft.upsertFromMessage':
    case 'draft.replaceFromMessage': {
      const externalId = readExternalActorId(ctx);
      const draftTextCurrent = asString(action.params.text) ?? readIncomingText(ctx);
      const source = asString(action.params.source) ?? ctx.event.meta.source;
      if (!externalId || !draftTextCurrent || !source) {
        return {
          actionId: action.id,
          status: 'skipped',
          error: 'DRAFT_INPUT_MISSING',
        };
      }
      const writes: DbWriteMutation[] = [{
        type: 'draft.upsert',
        params: {
          id: randomUUID(),
          resource: ctx.event.meta.source,
          externalId,
          source,
          externalChatId: readIncomingChatId(ctx),
          externalMessageId: readIncomingMessageId(ctx),
          draftTextCurrent,
          state: 'pending_confirmation',
        },
      }];
      await persistWrites(deps.writePort, writes);
      return {
        actionId: action.id,
        status: 'success',
        writes,
        values: {
          draftState: 'pending_confirmation',
          draftTextCurrent,
          draftSourceMessageId: readIncomingMessageId(ctx) ?? undefined,
          hasActiveDraft: true,
        },
      };
    }

    case 'draft.cancel': {
      const externalId = readExternalActorId(ctx);
      const source = asString(action.params.source) ?? ctx.event.meta.source;
      if (!externalId || !source) {
        return {
          actionId: action.id,
          status: 'skipped',
          error: 'DRAFT_CANCEL_INPUT_MISSING',
        };
      }
      const writes: DbWriteMutation[] = [{
        type: 'draft.cancel',
        params: {
          resource: ctx.event.meta.source,
          externalId,
          source,
        },
      }];
      await persistWrites(deps.writePort, writes);
      return {
        actionId: action.id,
        status: 'success',
        writes,
        values: {
          hasActiveDraft: false,
          draftState: undefined,
          draftTextCurrent: undefined,
          draftSourceMessageId: undefined,
        },
      };
    }

    case 'draft.send': {
      const externalId = readExternalActorId(ctx);
      const source = asString(action.params.source) ?? ctx.event.meta.source;
      if (!deps.readPort || !externalId || !source) {
        return {
          actionId: action.id,
          status: 'skipped',
          error: 'DRAFT_SEND_INPUT_MISSING',
        };
      }
      const draft = await deps.readPort.readDb<Record<string, unknown> | null>({
        type: 'draft.activeByIdentity',
        params: {
          resource: ctx.event.meta.source,
          externalId,
          source,
        },
      });
      if (!draft) {
        return {
          actionId: action.id,
          status: 'skipped',
          error: 'DRAFT_NOT_FOUND',
        };
      }

      const draftTextCurrent = asString(draft.draft_text_current);
      const userChannelId = asString(draft.channel_id);
      const adminChatId = asNumber(asRecord(ctx.base.facts).adminChatId);
      if (!draftTextCurrent || !userChannelId || adminChatId === null) {
        return {
          actionId: action.id,
          status: 'skipped',
          error: 'DRAFT_SEND_CONTEXT_MISSING',
        };
      }

      const conversationId = randomUUID();
      const firstMessageId = randomUUID();
      const questionId = randomUUID();
      const firstQuestionMessageId = randomUUID();
      let userIdentityId = asString(draft.identity_id);
      if (!userIdentityId && deps.readPort) {
        const resolvedId = await deps.readPort.readDb<string | null>({
          type: 'identity.idByResourceAndExternalId',
          params: { resource: ctx.event.meta.source, externalId: userChannelId },
        });
        userIdentityId = asString(resolvedId) ?? '';
      }
      const writes: DbWriteMutation[] = [
        {
          type: 'conversation.open',
          params: {
            id: conversationId,
            resource: ctx.event.meta.source,
            externalId,
            source,
            adminScope: asString(action.params.adminScope) ?? 'default',
            status: 'waiting_admin',
            openedAt: ctx.nowIso,
            lastMessageAt: ctx.nowIso,
          },
        },
        {
          type: 'conversation.message.add',
          params: {
            id: firstMessageId,
            conversationId,
            senderRole: 'user',
            text: draftTextCurrent,
            source,
            externalChatId: asString(draft.external_chat_id),
            externalMessageId: asString(draft.external_message_id),
            createdAt: ctx.nowIso,
          },
        },
        ...(userIdentityId ? [{
          type: 'question.create' as const,
          params: {
            id: questionId,
            userIdentityId,
            conversationId,
            telegramMessageId: asString(draft.external_message_id),
            text: draftTextCurrent,
            createdAt: ctx.nowIso,
          },
        }, {
          type: 'question.message.add' as const,
          params: {
            id: firstQuestionMessageId,
            questionId,
            senderType: 'user',
            messageText: draftTextCurrent,
            createdAt: ctx.nowIso,
          },
        }] : []),
        {
          type: 'draft.cancel',
          params: {
            resource: ctx.event.meta.source,
            externalId,
            source,
          },
        },
      ];
      await persistWrites(deps.writePort, writes);

      const userLabel = formatActorLabel({
        firstName: asString(draft.first_name),
        lastName: asString(draft.last_name),
        username: asString(draft.username),
        channelId: userChannelId,
      });
      const adminText = await renderText({
        templateKey: action.params.adminTemplateKey ?? ADMIN.FORWARD,
        vars: {
          name: userLabel,
          username: asString(draft.username),
          channelId: userChannelId,
          messageText: draftTextCurrent,
        },
        ctx,
        templatePort: deps.templatePort,
      });
      const replyButtonText = deps.templatePort
        ? (await renderText({ templateKey: ADMIN.REPLY_BUTTON, ctx, templatePort: deps.templatePort })) || 'Ответить'
        : 'Ответить';
      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId: adminChatId },
          message: { text: adminText || draftTextCurrent },
          replyMarkup: {
            inline_keyboard: [[
              { text: replyButtonText, callback_data: `admin_reply:${conversationId}` },
            ]],
          },
          delivery: { maxAttempts: 1 },
        },
      }];
      return {
        actionId: action.id,
        status: 'success',
        writes,
        intents,
        values: {
          hasActiveDraft: false,
          hasOpenConversation: true,
          activeConversationId: conversationId,
          activeConversationStatus: 'waiting_admin',
        },
      };
    }

    case 'conversation.user.message': {
      if (!deps.readPort) {
        return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
      }
      const externalId = readExternalActorId(ctx);
      const source = asString(action.params.source) ?? ctx.event.meta.source;
      const text = asString(action.params.text) ?? readIncomingText(ctx);
      if (!externalId || !source || !text) {
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
      const writes: DbWriteMutation[] = [
        {
          type: 'conversation.message.add',
          params: {
            id: randomUUID(),
            conversationId,
            senderRole: 'user',
            text,
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

      const userLabel = formatActorLabel({
        firstName: asString(conversation?.first_name),
        lastName: asString(conversation?.last_name),
        username: asString(conversation?.username),
        channelId: asString(conversation?.user_channel_id),
      });
      const newMessageText = deps.templatePort
        ? (await renderText({
          templateKey: ADMIN.CONVERSATION_NEW_MESSAGE,
          vars: { userLabel, text },
          ctx,
          templatePort: deps.templatePort,
        })) || `Новое сообщение в диалоге\nОт: ${userLabel}\n\n${text}`
        : `Новое сообщение в диалоге\nОт: ${userLabel}\n\n${text}`;
      const replyButtonText = deps.templatePort
        ? (await renderText({ templateKey: ADMIN.REPLY_BUTTON, ctx, templatePort: deps.templatePort })) || 'Ответить'
        : 'Ответить';
      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId: adminChatId },
          message: { text: newMessageText },
          replyMarkup: {
            inline_keyboard: [[
              { text: replyButtonText, callback_data: `admin_reply:${conversationId}` },
            ]],
          },
          delivery: { maxAttempts: 1 },
        },
      }];
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

    case 'conversation.admin.reply': {
      if (!deps.readPort) {
        return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
      }
      const conversationId = readConversationId(action, ctx);
      const text = asString(action.params.text) ?? readIncomingText(ctx);
      if (!conversationId || !text) {
        return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_ADMIN_REPLY_INPUT_MISSING' };
      }
      const conversation = await deps.readPort.readDb<Record<string, unknown> | null>({
        type: 'conversation.byId',
        params: { id: conversationId },
      });
      const userChatIdRaw = asString(conversation?.user_channel_id);
      const userChatId = userChatIdRaw ? Number(userChatIdRaw) : Number.NaN;
      const adminChatId = asNumber(readIncoming(ctx).chatId);
      if (!conversation || !Number.isFinite(userChatId)) {
        return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_NOT_FOUND' };
      }
      const sourceForConversation = asString(conversation.source) ?? ctx.event.meta.source;
      const writes: DbWriteMutation[] = [
        {
          type: 'conversation.message.add',
          params: {
            id: randomUUID(),
            conversationId,
            senderRole: 'admin',
            text,
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
              messageText: text,
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

      const intents: OutgoingIntent[] = [
        {
          type: 'message.send',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId: userChatId },
            message: { text },
            delivery: { maxAttempts: 1 },
          },
        },
      ];
      if (adminChatId !== null) {
        const sentText = deps.templatePort
          ? (await renderText({ templateKey: ADMIN.REPLY_SENT, ctx, templatePort: deps.templatePort })) || 'Сообщение отправлено.'
          : 'Сообщение отправлено.';
        const continueButtonText = deps.templatePort
          ? (await renderText({ templateKey: ADMIN.REPLY_CONTINUE_BUTTON, ctx, templatePort: deps.templatePort })) || 'Дополнить ответ'
          : 'Дополнить ответ';
        const closeButtonText = deps.templatePort
          ? (await renderText({ templateKey: ADMIN.DIALOG_CLOSE_BUTTON, ctx, templatePort: deps.templatePort })) || 'Завершить диалог'
          : 'Завершить диалог';
        intents.push({
          type: 'message.send',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId: adminChatId },
            message: { text: sentText },
            replyMarkup: {
              inline_keyboard: [
                [{ text: continueButtonText, callback_data: `admin_reply_continue:${conversationId}` }],
                [{ text: closeButtonText, callback_data: `admin_close_dialog:${conversationId}` }],
              ],
            },
            delivery: { maxAttempts: 1 },
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

    case 'conversation.close': {
      if (!deps.readPort) {
        return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
      }
      const conversationId = readConversationId(action, ctx);
      if (!conversationId) {
        return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_ID_MISSING' };
      }
      const writes: DbWriteMutation[] = [{
        type: 'conversation.state.set',
        params: {
          id: conversationId,
          status: 'closed',
          lastMessageAt: ctx.nowIso,
          closedAt: ctx.nowIso,
          closeReason: asString(action.params.closeReason) ?? 'admin_closed',
        },
      }];
      await persistWrites(deps.writePort, writes);
      const intents: OutgoingIntent[] = [];
      const adminClosedText = deps.templatePort
        ? (await renderText({ templateKey: ADMIN.DIALOG_CLOSED, ctx, templatePort: deps.templatePort })) || 'Диалог завершён.'
        : 'Диалог завершён.';
      intents.push(sendAdminMessage({ action, ctx, text: adminClosedText }));
      return { actionId: action.id, status: 'success', writes, ...(intents.length > 0 ? { intents } : {}) };
    }

    case 'conversation.listOpen': {
      if (!deps.readPort) {
        return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
      }
      const items = await deps.readPort.readDb<Array<Record<string, unknown>>>({
        type: 'conversation.listOpen',
        params: {
          source: asString(action.params.source) ?? ctx.event.meta.source,
          limit: asNumber(action.params.limit) ?? 10,
        },
      });
      const adminChatId = asNumber(readIncoming(ctx).chatId);
      if (adminChatId === null) {
        return { actionId: action.id, status: 'skipped', error: 'ADMIN_CHAT_ID_MISSING' };
      }
      const rows = Array.isArray(items) ? items : [];
      const listBody = rows.map((item, index) => {
        const label = formatActorLabel({
          firstName: asString(item.first_name),
          lastName: asString(item.last_name),
          username: asString(item.username),
          channelId: asString(item.user_channel_id),
        });
        const status = asString(item.status) ?? 'open';
        return `${index + 1}. ${label} [${status}]`;
      }).join('\n');
      const text = rows.length === 0
        ? (deps.templatePort ? (await renderText({ templateKey: ADMIN.DIALOGS_EMPTY, ctx, templatePort: deps.templatePort })) || 'Открытых диалогов нет.' : 'Открытых диалогов нет.')
        : (deps.templatePort ? (await renderText({ templateKey: ADMIN.DIALOGS_LIST, vars: { listBody }, ctx, templatePort: deps.templatePort })) || `Открытые диалоги:\n\n${listBody}` : `Открытые диалоги:\n\n${listBody}`);
      const inline_keyboard = rows.slice(0, 10).map((item) => [{
        text: formatActorLabel({
          firstName: asString(item.first_name),
          lastName: asString(item.last_name),
          username: asString(item.username),
          channelId: asString(item.user_channel_id),
        }),
        callback_data: `dialogs.view:${asString(item.id)}`,
      }]);
      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId: adminChatId },
          message: { text },
          ...(inline_keyboard.length > 0 ? { replyMarkup: { inline_keyboard } } : {}),
          delivery: { maxAttempts: 1 },
        },
      }];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'question.listUnanswered': {
      if (!deps.readPort) {
        return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
      }
      const items = await deps.readPort.readDb<Array<Record<string, unknown>>>({
        type: 'questions.unanswered',
        params: { limit: asNumber(action.params.limit) ?? 20 },
      });
      const adminChatId = asNumber(readIncoming(ctx).chatId);
      if (adminChatId === null) {
        return { actionId: action.id, status: 'skipped', error: 'ADMIN_CHAT_ID_MISSING' };
      }
      const rows = Array.isArray(items) ? items : [];
      const listBodyUnanswered = rows.map((item, index) => {
        const label = formatActorLabel({
          firstName: asString(item.first_name),
          lastName: asString(item.last_name),
          username: asString(item.username),
          channelId: asString(item.user_channel_id),
        });
        const excerpt = (asString(item.text) ?? '').slice(0, 80);
        return `${index + 1}. ${label}\n   ${excerpt}${(asString(item.text) ?? '').length > 80 ? '…' : ''}`;
      }).join('\n\n');
      const text = rows.length === 0
        ? (deps.templatePort ? (await renderText({ templateKey: ADMIN.QUESTIONS_EMPTY, ctx, templatePort: deps.templatePort })) || 'Неотвеченных вопросов нет.' : 'Неотвеченных вопросов нет.')
        : (deps.templatePort ? (await renderText({ templateKey: ADMIN.QUESTIONS_LIST, vars: { count: rows.length, listBody: listBodyUnanswered }, ctx, templatePort: deps.templatePort })) || `Неотвеченные вопросы (${rows.length}):\n\n${listBodyUnanswered}` : `Неотвеченные вопросы (${rows.length}):\n\n${listBodyUnanswered}`);
      const filteredRows = rows.filter((item) => asString(item.conversation_id)).slice(0, 15);
      const inline_keyboard = deps.templatePort
        ? await Promise.all(filteredRows.map(async (item) => {
          const label = formatActorLabel({
            firstName: asString(item.first_name),
            lastName: asString(item.last_name),
            username: asString(item.username),
            channelId: asString(item.user_channel_id),
          });
          const btnText = (await renderText({ templateKey: ADMIN.QUESTIONS_REPLY_BUTTON, vars: { label }, ctx, templatePort: deps.templatePort })) || `Ответить: ${label}`;
          return [{ text: btnText, callback_data: `admin_reply:${asString(item.conversation_id)}` }];
        }))
        : filteredRows.map((item) => [{
          text: `Ответить: ${formatActorLabel({
            firstName: asString(item.first_name),
            lastName: asString(item.last_name),
            username: asString(item.username),
            channelId: asString(item.user_channel_id),
          })}`,
          callback_data: `admin_reply:${asString(item.conversation_id)}`,
        }]);
      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId: adminChatId },
          message: { text },
          ...(inline_keyboard.length > 0 ? { replyMarkup: { inline_keyboard } } : {}),
          delivery: { maxAttempts: 1 },
        },
      }];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'conversation.show': {
      if (!deps.readPort) {
        return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
      }
      const conversationId = readConversationId(action, ctx);
      const adminChatId = asNumber(readIncoming(ctx).chatId);
      if (!conversationId || adminChatId === null) {
        return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_SHOW_INPUT_MISSING' };
      }
      const conversation = await deps.readPort.readDb<Record<string, unknown> | null>({
        type: 'conversation.byId',
        params: { id: conversationId },
      });
      if (!conversation) {
        return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_NOT_FOUND' };
      }
      const label = formatActorLabel({
        firstName: asString(conversation.first_name),
        lastName: asString(conversation.last_name),
        username: asString(conversation.username),
        channelId: asString(conversation.user_channel_id),
      });
      const status = asString(conversation.status) ?? 'open';
      const showText = deps.templatePort
        ? (await renderText({ templateKey: ADMIN.CONVERSATION_SHOW, vars: { label, status }, ctx, templatePort: deps.templatePort })) || `Диалог\nПользователь: ${label}\nСтатус: ${status}`
        : `Диалог\nПользователь: ${label}\nСтатус: ${status}`;
      const replyBtnText = deps.templatePort
        ? (await renderText({ templateKey: ADMIN.REPLY_BUTTON, ctx, templatePort: deps.templatePort })) || 'Ответить'
        : 'Ответить';
      const closeBtnText = deps.templatePort
        ? (await renderText({ templateKey: ADMIN.DIALOG_CLOSE_BUTTON, ctx, templatePort: deps.templatePort })) || 'Завершить диалог'
        : 'Завершить диалог';
      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId: adminChatId },
          message: { text: showText },
          replyMarkup: {
            inline_keyboard: [
              [{ text: replyBtnText, callback_data: `admin_reply:${conversationId}` }],
              [{ text: closeBtnText, callback_data: `admin_close_dialog:${conversationId}` }],
            ],
          },
          delivery: { maxAttempts: 1 },
        },
      }];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'notifications.get': {
      const settings = deps.readPort
        ? await deps.readPort.readDb<NotificationSettings | null>({
            type: 'notifications.settings',
            params: {
              resource: ctx.event.meta.source,
              channelUserId: action.params.channelUserId ?? action.params.channelId,
            },
          })
        : null;
      return {
        actionId: action.id,
        status: 'success',
        values: { notifications: settings ?? defaultNotificationSettings() },
      };
    }

    case 'notifications.toggle': {
      const currentSettings = readNotificationSettings(ctx)
        ?? (deps.readPort
          ? await deps.readPort.readDb<NotificationSettings | null>({
              type: 'notifications.settings',
              params: {
                resource: ctx.event.meta.source,
                channelUserId: action.params.channelUserId ?? action.params.channelId,
              },
            }) ?? defaultNotificationSettings()
          : defaultNotificationSettings());
      const toggleKey = asString(action.params.toggleKey);
      let nextSettings: NotificationSettings = { ...currentSettings };
      if (toggleKey === 'notify_toggle_spb') nextSettings.notify_spb = !currentSettings.notify_spb;
      if (toggleKey === 'notify_toggle_msk') nextSettings.notify_msk = !currentSettings.notify_msk;
      if (toggleKey === 'notify_toggle_online') nextSettings.notify_online = !currentSettings.notify_online;
      if (toggleKey === 'notify_toggle_bookings') nextSettings.notify_bookings = !currentSettings.notify_bookings;
      if (toggleKey === 'notify_toggle_all' && action.params.supportsToggleAll === true) {
        const allEnabled = currentSettings.notify_spb && currentSettings.notify_msk && currentSettings.notify_online && currentSettings.notify_bookings;
        nextSettings = {
          notify_spb: !allEnabled,
          notify_msk: !allEnabled,
          notify_online: !allEnabled,
          notify_bookings: !allEnabled,
        };
      }
      const writes: DbWriteMutation[] = [{
        type: 'notifications.update',
        params: {
          resource: ctx.event.meta.source,
          channelUserId: action.params.channelUserId ?? action.params.channelId,
          notify_spb: nextSettings.notify_spb,
          notify_msk: nextSettings.notify_msk,
          notify_online: nextSettings.notify_online,
          notify_bookings: nextSettings.notify_bookings,
        },
      }];
      await persistWrites(deps.writePort, writes);
      return {
        actionId: action.id,
        status: 'success',
        writes,
        values: { notifications: nextSettings },
      };
    }

    case 'reminders.rules.get': {
      if (!deps.readPort) return { actionId: action.id, status: 'skipped', error: 'reminders.rules.get: no readPort' };
      const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
      const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
      if (!channelUserId) return { actionId: action.id, status: 'failed', error: 'reminders.rules.get: missing channelUserId' };
      const link = await deps.readPort.readDb<{ userId?: string } | null>({
        type: 'user.byIdentity',
        params: { resource, externalId: channelUserId },
      });
      const userId = link && typeof link === 'object' && typeof link.userId === 'string' ? link.userId : null;
      if (!userId) return { actionId: action.id, status: 'success', values: { reminderRules: [] } };
      const rules = await deps.readPort.readDb<ReminderRuleRecord[]>({
        type: 'reminders.rules.forUser',
        params: { userId },
      });
      const list = Array.isArray(rules) ? rules : [];
      return { actionId: action.id, status: 'success', values: { reminderRules: list, reminderUserId: userId } };
    }

    case 'reminders.rule.toggle': {
      if (!deps.readPort || !deps.writePort) return { actionId: action.id, status: 'skipped', error: 'reminders.rule.toggle: missing port' };
      const userId = asString(action.params.userId);
      const category = asString(action.params.category) as ReminderCategory | null;
      if (!userId || !category) return { actionId: action.id, status: 'failed', error: 'reminders.rule.toggle: missing userId or category' };
      const existing = await deps.readPort.readDb<ReminderRuleRecord | null>({
        type: 'reminders.rule.forUserAndCategory',
        params: { userId, category },
      });
      const ruleId = existing?.id ?? `reminder:${userId}:${category}`;
      const nextEnabled = existing ? !existing.isEnabled : true;
      const record: ReminderRuleRecord = existing ?? buildDefaultReminderRule({ id: ruleId, userId, category });
      const writes: DbWriteMutation[] = [{
        type: 'reminders.rule.upsert',
        params: {
          id: ruleId,
          userId,
          category,
          isEnabled: nextEnabled,
          scheduleType: record.scheduleType,
          timezone: record.timezone,
          intervalMinutes: record.intervalMinutes,
          windowStartMinute: record.windowStartMinute,
          windowEndMinute: record.windowEndMinute,
          daysMask: record.daysMask,
          contentMode: record.contentMode,
        },
      }];
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes, values: { reminderRule: { ...record, isEnabled: nextEnabled } } };
    }

    case 'reminders.rule.cyclePreset': {
      if (!deps.readPort || !deps.writePort) return { actionId: action.id, status: 'skipped', error: 'reminders.rule.cyclePreset: missing port' };
      const userId = asString(action.params.userId);
      const category = asString(action.params.category) as ReminderCategory | null;
      if (!userId || !category) return { actionId: action.id, status: 'failed', error: 'reminders.rule.cyclePreset: missing userId or category' };
      const existing = await deps.readPort.readDb<ReminderRuleRecord | null>({
        type: 'reminders.rule.forUserAndCategory',
        params: { userId, category },
      });
      const currentPreset = existing ? detectReminderPreset(existing) : null;
      const nextPreset = cycleReminderPreset(currentPreset);
      const config = reminderPresetConfig(nextPreset);
      const ruleId = existing?.id ?? `reminder:${userId}:${category}`;
      const record: ReminderRuleRecord = existing ?? buildDefaultReminderRule({ id: ruleId, userId, category });
      const writes: DbWriteMutation[] = [{
        type: 'reminders.rule.upsert',
        params: {
          id: ruleId,
          userId,
          category,
          isEnabled: record.isEnabled,
          scheduleType: record.scheduleType,
          timezone: record.timezone,
          intervalMinutes: config.intervalMinutes,
          windowStartMinute: config.windowStartMinute,
          windowEndMinute: config.windowEndMinute,
          daysMask: record.daysMask,
          contentMode: record.contentMode,
        },
      }];
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes, values: { reminderPreset: nextPreset } };
    }

    case 'reminders.dispatchDue': {
      if (!deps.readPort || !deps.writePort) return { actionId: action.id, status: 'skipped', error: 'reminders.dispatchDue: missing port' };
      const dueNowIso = asString(action.params.nowIso) ?? nowIso(ctx);
      const limit = asNumber(action.params.limit) ?? 50;
      const dueList = await deps.readPort.readDb<DueReminderOccurrence[]>({
        type: 'reminders.occurrences.due',
        params: { nowIso: dueNowIso, limit: Math.max(1, Math.min(limit, 100)) },
      });
      const items = Array.isArray(dueList) ? dueList : [];
      const writes: DbWriteMutation[] = [];
      const intents: OutgoingIntent[] = [];
      for (const occ of items) {
        writes.push({
          type: 'reminders.occurrence.markQueued',
          params: { occurrenceId: occ.id, deliveryJobId: null },
        });
        const templateKey = REMINDER_BY_CATEGORY[occ.category] ?? 'telegram:reminder.exercise';
        const text = deps.templatePort
          ? (await deps.templatePort.renderTemplate({
            source: 'telegram',
            templateId: templateKey.replace(/^telegram:/, ''),
            vars: {},
            audience: 'user',
          })).text
          : 'Пора подвигаться';
        intents.push({
          type: 'message.send',
          meta: {
            eventId: `${ctx.event.meta.eventId}:reminder:${occ.id}`,
            occurredAt: dueNowIso,
            source: 'scheduler',
            userId: occ.userId,
          },
          payload: {
            recipient: { chatId: occ.chatId },
            message: { text },
            delivery: { channels: ['telegram'], maxAttempts: 1 },
          },
        });
      }
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes, intents };
    }

    case 'content.section.open': {
      if (!deps.contentCatalogPort) return { actionId: action.id, status: 'skipped', error: 'content.section.open: no contentCatalogPort' };
      const section = asString(action.params.section);
      const userId = asString(action.params.userId);
      const chatId = asNumber(action.params.chatId);
      if (!section) return { actionId: action.id, status: 'failed', error: 'content.section.open: missing section' };
      const url = await deps.contentCatalogPort.getSectionLink({
        section: section as Parameters<ContentCatalogPort['getSectionLink']>[0]['section'],
        ...(userId ? { userId } : {}),
      });
      const sectionPlaceholder: Record<string, string> = {
        useful_lessons: 'Здесь скоро будет много полезного, я вам обязательно сообщу!',
        emergency_help: 'Здесь скоро будут советы и упражнения для снятия острой боли, как только сделаю - я вам обязательно сообщу!',
      };
      const text = url
        ? `Открыть раздел: ${url}`
        : (sectionPlaceholder[section] ?? 'Раздел пока недоступен.');
      const intents: OutgoingIntent[] = chatId != null && Number.isFinite(chatId)
        ? [{
          type: 'message.send',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId },
            message: { text },
            delivery: { channels: ['telegram'], maxAttempts: 1 },
          },
        }]
        : [];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'log.audit': {
      const writes: DbWriteMutation[] = [{
        type: 'event.log',
        params: {
          source: 'domain',
          eventType: 'audit',
          eventId: `${ctx.event.meta.eventId}:audit:${action.id}`,
          occurredAt: nowIso(ctx),
          body: action.params,
        },
      }];
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes };
    }

    default:
      return {
        actionId: action.id,
        status: 'skipped',
        error: `ACTION_NOT_IMPLEMENTED:${action.type}`,
      };
  }
}
