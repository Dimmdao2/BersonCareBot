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
import { handleConversationAdminReply, handleConversationUserMessage } from './handlers/supportRelay.js';
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

    case 'webapp.event.emit': {
      const port = deps.webappEventsPort;
      if (!port) {
        return { actionId: action.id, status: 'success', values: { webappEmit: { ok: false, reason: 'webappEventsPort not configured' } } };
      }
      const eventType = asString(action.params.eventType);
      if (!eventType) {
        return { actionId: action.id, status: 'failed', error: 'webapp.event.emit: eventType required' };
      }
      const payload = asRecord(action.params.payload ?? {});
      let userId = asString(payload.userId);
      if (!userId && deps.readPort) {
        const source = asString(ctx.event.meta.source) ?? 'telegram';
        const channelUserId = asNumericString(readExternalActorId(ctx))
          ?? asNumericString((ctx.event.payload as { incoming?: { channelUserId?: unknown } })?.incoming?.channelUserId);
        if (channelUserId) {
          const link = await deps.readPort.readDb<{ userId?: string } | null>({
            type: 'user.byIdentity',
            params: { resource: source, externalId: channelUserId },
          });
          userId = link && typeof link === 'object' && typeof link.userId === 'string' ? link.userId : null;
        }
      }
      const mergedPayload = userId ? { ...payload, userId } : payload;
      const eventId = asString(action.params.eventId);
      const occurredAt = asString(action.params.occurredAt) ?? ctx.nowIso;
      const idempotencyKey = asString(action.params.idempotencyKey);
      const payloadForEvent = Object.keys(mergedPayload).length > 0 ? mergedPayload : undefined;
      const eventBody = {
        eventType,
        ...(eventId ? { eventId } : {}),
        occurredAt,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(payloadForEvent ? { payload: payloadForEvent } : {}),
      };
      const result = await port.emit(eventBody);
      if (!result.ok) {
        return { actionId: action.id, status: 'success', values: { webappEmit: { ok: false, status: result.status, error: result.error } } };
      }
      return { actionId: action.id, status: 'success', values: { webappEmit: { ok: true, status: result.status } } };
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
      if (action.type === 'admin.forward') {
        const userMessage = asString((action.params.vars as Record<string, unknown>)?.messageText)
          ?? readIncomingText(ctx);
        if (userMessage && /^\/start\s+set/i.test(userMessage.trim())) {
          return { actionId: action.id, status: 'success' };
        }
      }
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
      const parseMode = action.params.parseMode === 'HTML' || action.params.parseMode === 'Markdown'
        ? action.params.parseMode
        : undefined;
      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: chatId === null ? {} : { chatId },
          message: { text },
          ...(replyMarkup ? { replyMarkup } : {}),
          ...(parseMode ? { parse_mode: parseMode } : {}),
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
      const parseMode = action.params.parseMode === 'HTML' || action.params.parseMode === 'Markdown'
        ? action.params.parseMode
        : undefined;
      const intents: OutgoingIntent[] = [{
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: chatId === null ? {} : { chatId },
          ...(messageId === null ? {} : { messageId }),
          message: { text },
          ...(replyMarkup ? { replyMarkup } : {}),
          ...(parseMode ? { parse_mode: parseMode } : {}),
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
      return handleConversationUserMessage(action, ctx, fullDeps);
    }

    case 'conversation.admin.reply': {
      return handleConversationAdminReply(action, ctx, fullDeps);
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
        ? (await renderText({ templateKey: ADMIN.DIALOG_CLOSE_BUTTON, ctx, templatePort: deps.templatePort }))?.trim() ?? ''
        : '';
      const rows: Array<Array<{ text: string; callback_data: string }>> = [
        [{ text: replyBtnText, callback_data: `admin_reply:${conversationId}` }],
      ];
      if (closeBtnText) {
        rows.push([{ text: closeBtnText, callback_data: `admin_close_dialog:${conversationId}` }]);
      }
      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId: adminChatId },
          message: { text: showText },
          replyMarkup: { inline_keyboard: rows },
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
      let userId = asString(action.params.userId);
      if (!userId) {
        const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
        const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
        if (!channelUserId) return { actionId: action.id, status: 'failed', error: 'reminders.rule.toggle: missing userId or channelUserId' };
        const link = await deps.readPort.readDb<{ userId?: string } | null>({
          type: 'user.byIdentity',
          params: { resource, externalId: channelUserId },
        });
        userId = link && typeof link === 'object' && typeof link.userId === 'string' ? link.userId : null;
      }
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
      let userId = asString(action.params.userId);
      if (!userId) {
        const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
        const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
        if (!channelUserId) return { actionId: action.id, status: 'failed', error: 'reminders.rule.cyclePreset: missing userId or channelUserId' };
        const link = await deps.readPort.readDb<{ userId?: string } | null>({
          type: 'user.byIdentity',
          params: { resource, externalId: channelUserId },
        });
        userId = link && typeof link === 'object' && typeof link.userId === 'string' ? link.userId : null;
      }
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

    case 'diary.symptom.list': {
      const port = deps.webappEventsPort;
      const chatId = asNumber(action.params.chatId);
      const messageId = asNumber(action.params.messageId);
      const callbackQueryId = asString(action.params.callbackQueryId);
      if (chatId === null) {
        return { actionId: action.id, status: 'failed', error: 'diary.symptom.list: chatId required' };
      }
      let userId: string | null = asString(action.params.userId);
      if (!userId && deps.readPort) {
        const source = asString(ctx.event.meta.source) ?? 'telegram';
        const channelUserId = asNumericString(readExternalActorId(ctx))
          ?? asNumericString((ctx.event.payload as { incoming?: { channelUserId?: unknown } })?.incoming?.channelUserId);
        if (channelUserId) {
          const link = await deps.readPort.readDb<{ userId?: string } | null>({
            type: 'user.byIdentity',
            params: { resource: source, externalId: channelUserId },
          });
          userId = link && typeof link === 'object' && typeof link.userId === 'string' ? link.userId : null;
        }
      }
      const intents: OutgoingIntent[] = [];
      if (callbackQueryId) {
        intents.push({ type: 'callback.answer', meta: buildIntentMeta(action, ctx), payload: { callbackQueryId } });
      }
      const listText = deps.templatePort
        ? (await renderText({
            templateKey: `${ctx.event.meta.source}:diary.symptom.listHeading`,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Симптомы. Выберите или добавьте.'
        : 'Симптомы. Выберите или добавьте.';
      if (!port || !userId) {
        intents.push({
          type: 'message.edit',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId },
            ...(messageId !== null ? { messageId } : {}),
            message: { text: listText },
            replyMarkup: {
              inline_keyboard: [[{ text: 'Добавить симптом для отслеживания', callback_data: 'diary.symptom.add' }]],
            },
          },
        });
        return { actionId: action.id, status: 'success', intents };
      }
      const { trackings = [] } = await port.listSymptomTrackings(userId);
      const rows: Array<Array<{ text: string; callback_data: string }>> = trackings.map((t) => [
        { text: t.symptomTitle || t.id, callback_data: `diary.symptom.select:${t.id}` },
      ]);
      rows.push([{ text: '➕ Добавить симптом для отслеживания', callback_data: 'diary.symptom.add' }]);
      intents.push({
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          ...(messageId !== null ? { messageId } : {}),
          message: { text: listText },
          replyMarkup: { inline_keyboard: rows },
        },
      });
      return { actionId: action.id, status: 'success', intents };
    }

    case 'diary.symptom.select': {
      const trackingId = asString(action.params.trackingId);
      const chatId = asNumber(action.params.chatId);
      const messageId = asNumber(action.params.messageId);
      const callbackQueryId = asString(action.params.callbackQueryId);
      if (!trackingId || chatId === null) {
        return { actionId: action.id, status: 'failed', error: 'diary.symptom.select: trackingId and chatId required' };
      }
      const rateText = deps.templatePort
        ? (await renderText({
            templateKey: `${ctx.event.meta.source}:diary.symptom.ratePrompt`,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Оцените от 0 до 10'
        : 'Оцените от 0 до 10';
      const valueRow = Array.from({ length: 11 }, (_, i) => ({
        text: String(i),
        callback_data: `diary.symptom.value:${trackingId}:${i}`,
      }));
      const intents: OutgoingIntent[] = [];
      if (callbackQueryId) {
        intents.push({ type: 'callback.answer', meta: buildIntentMeta(action, ctx), payload: { callbackQueryId } });
      }
      intents.push({
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          ...(messageId !== null ? { messageId } : {}),
          message: { text: rateText },
          replyMarkup: { inline_keyboard: [valueRow] },
        },
      });
      return { actionId: action.id, status: 'success', intents };
    }

    case 'diary.symptom.value': {
      const trackingId = asString(action.params.trackingId);
      const valueRaw = asNumber(action.params.value) ?? asString(action.params.value);
      const value0_10 = valueRaw !== null ? Math.min(10, Math.max(0, Math.round(Number(valueRaw)))) : null;
      const chatId = asNumber(action.params.chatId);
      const messageId = asNumber(action.params.messageId);
      const callbackQueryId = asString(action.params.callbackQueryId);
      if (!trackingId || value0_10 === null || chatId === null) {
        return { actionId: action.id, status: 'failed', error: 'diary.symptom.value: trackingId, value and chatId required' };
      }
      const typeText = deps.templatePort
        ? (await renderText({
            templateKey: `${ctx.event.meta.source}:diary.symptom.typePrompt`,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Тип записи'
        : 'Тип записи';
      const intents: OutgoingIntent[] = [];
      if (callbackQueryId) {
        intents.push({ type: 'callback.answer', meta: buildIntentMeta(action, ctx), payload: { callbackQueryId } });
      }
      intents.push({
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          ...(messageId !== null ? { messageId } : {}),
          message: { text: typeText },
          replyMarkup: {
            inline_keyboard: [
              [
                { text: 'В моменте', callback_data: `diary.symptom.entryType:${trackingId}:${value0_10}:instant` },
                { text: 'В течение дня', callback_data: `diary.symptom.entryType:${trackingId}:${value0_10}:daily` },
              ],
            ],
          },
        },
      });
      return { actionId: action.id, status: 'success', intents };
    }

    case 'diary.symptom.entryType': {
      const trackingId = asString(action.params.trackingId);
      const entryTypeRaw = asString(action.params.entryType);
      const entryType = entryTypeRaw === 'daily' ? 'daily' : 'instant';
      const valueFromPrev = asNumber(action.params.value);
      const value0_10 = valueFromPrev !== null ? Math.min(10, Math.max(0, Math.round(valueFromPrev))) : 5;
      const chatId = asNumber(action.params.chatId);
      const messageId = asNumber(action.params.messageId);
      const callbackQueryId = asString(action.params.callbackQueryId);
      if (!trackingId || chatId === null) {
        return { actionId: action.id, status: 'failed', error: 'diary.symptom.entryType: trackingId and chatId required' };
      }
      let userId: string | null = asString(action.params.userId);
      if (!userId && deps.readPort) {
        const source = asString(ctx.event.meta.source) ?? 'telegram';
        const channelUserId = asNumericString(readExternalActorId(ctx))
          ?? asNumericString((ctx.event.payload as { incoming?: { channelUserId?: unknown } })?.incoming?.channelUserId);
        if (channelUserId) {
          const link = await deps.readPort.readDb<{ userId?: string } | null>({
            type: 'user.byIdentity',
            params: { resource: source, externalId: channelUserId },
          });
          userId = link && typeof link === 'object' && typeof link.userId === 'string' ? link.userId : null;
        }
      }
      const intents: OutgoingIntent[] = [];
      if (callbackQueryId) {
        intents.push({ type: 'callback.answer', meta: buildIntentMeta(action, ctx), payload: { callbackQueryId } });
      }
      const port = deps.webappEventsPort;
      if (port && userId) {
        await port.emit({
          eventType: 'diary.symptom.entry.created',
          occurredAt: nowIso(ctx),
          payload: {
            userId,
            trackingId,
            value0_10,
            entryType,
            recordedAt: nowIso(ctx),
          },
        });
      }
      const successText = deps.templatePort
        ? (await renderText({
            templateKey: `${ctx.event.meta.source}:diary.symptom.entrySuccess`,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Запись добавлена.'
        : 'Запись добавлена.';
      intents.push({
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          ...(messageId !== null ? { messageId } : {}),
          message: { text: successText },
          replyMarkup: { inline_keyboard: [[{ text: '⬅️ К списку симптомов', callback_data: 'diary.symptom.open' }]] },
        },
      });
      return { actionId: action.id, status: 'success', intents };
    }

    case 'diary.symptom.add': {
      const writes: DbWriteMutation[] = [{
        type: 'user.state.set',
        params: {
          resource: ctx.event.meta.source,
          channelUserId: readExternalActorId(ctx),
          state: 'diary.symptom.awaiting_title',
        },
      }];
      await persistWrites(deps.writePort, writes);
      const chatId = asNumber(action.params.chatId);
      const messageId = asNumber(action.params.messageId);
      const callbackQueryId = asString(action.params.callbackQueryId);
      const enterTitleText = deps.templatePort
        ? (await renderText({
            templateKey: `${ctx.event.meta.source}:diary.symptom.enterTitle`,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Введите название симптома для отслеживания.'
        : 'Введите название симптома для отслеживания.';
      const intents: OutgoingIntent[] = [];
      if (callbackQueryId) {
        intents.push({ type: 'callback.answer', meta: buildIntentMeta(action, ctx), payload: { callbackQueryId } });
      }
      if (chatId !== null) {
        intents.push({
          type: 'message.edit',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId },
            ...(messageId !== null ? { messageId } : {}),
            message: { text: enterTitleText },
            replyMarkup: {
              inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'diary.symptom.back' }]],
            },
          },
        });
      }
      return { actionId: action.id, status: 'success', writes, intents };
    }

    case 'diary.lfk.list': {
      const port = deps.webappEventsPort;
      const chatId = asNumber(action.params.chatId);
      const messageId = asNumber(action.params.messageId);
      const callbackQueryId = asString(action.params.callbackQueryId);
      if (chatId === null) {
        return { actionId: action.id, status: 'failed', error: 'diary.lfk.list: chatId required' };
      }
      let userId: string | null = asString(action.params.userId);
      if (!userId && deps.readPort) {
        const source = asString(ctx.event.meta.source) ?? 'telegram';
        const channelUserId = asNumericString(readExternalActorId(ctx))
          ?? asNumericString((ctx.event.payload as { incoming?: { channelUserId?: unknown } })?.incoming?.channelUserId);
        if (channelUserId) {
          const link = await deps.readPort.readDb<{ userId?: string } | null>({
            type: 'user.byIdentity',
            params: { resource: source, externalId: channelUserId },
          });
          userId = link && typeof link === 'object' && typeof link.userId === 'string' ? link.userId : null;
        }
      }
      const intents: OutgoingIntent[] = [];
      if (callbackQueryId) {
        intents.push({ type: 'callback.answer', meta: buildIntentMeta(action, ctx), payload: { callbackQueryId } });
      }
      const listText = deps.templatePort
        ? (await renderText({
            templateKey: `${ctx.event.meta.source}:diary.lfk.listHeading`,
            ctx,
            templatePort: deps.templatePort,
          })) || 'ЛФК. Выберите комплекс или добавьте.'
        : 'ЛФК. Выберите комплекс или добавьте.';
      if (!port || !userId) {
        intents.push({
          type: 'message.edit',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId },
            ...(messageId !== null ? { messageId } : {}),
            message: { text: listText },
            replyMarkup: {
              inline_keyboard: [[{ text: '➕ Добавить комплекс', callback_data: 'diary.lfk.add' }]],
            },
          },
        });
        return { actionId: action.id, status: 'success', intents };
      }
      const { complexes = [] } = await port.listLfkComplexes(userId);
      const rows: Array<Array<{ text: string; callback_data: string }>> = complexes.map((c) => [
        { text: c.title || c.id, callback_data: `diary.lfk.select:${c.id}` },
      ]);
      rows.push([{ text: '➕ Добавить комплекс', callback_data: 'diary.lfk.add' }]);
      intents.push({
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          ...(messageId !== null ? { messageId } : {}),
          message: { text: listText },
          replyMarkup: { inline_keyboard: rows },
        },
      });
      return { actionId: action.id, status: 'success', intents };
    }

    case 'diary.lfk.select': {
      const complexId = asString(action.params.complexId);
      const chatId = asNumber(action.params.chatId);
      const messageId = asNumber(action.params.messageId);
      const callbackQueryId = asString(action.params.callbackQueryId);
      if (!complexId || chatId === null) {
        return { actionId: action.id, status: 'failed', error: 'diary.lfk.select: complexId and chatId required' };
      }
      const promptText = deps.templatePort
        ? (await renderText({
            templateKey: `${ctx.event.meta.source}:diary.lfk.markSessionPrompt`,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Отметить занятие?'
        : 'Отметить занятие?';
      const intents: OutgoingIntent[] = [];
      if (callbackQueryId) {
        intents.push({ type: 'callback.answer', meta: buildIntentMeta(action, ctx), payload: { callbackQueryId } });
      }
      intents.push({
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          ...(messageId !== null ? { messageId } : {}),
          message: { text: promptText },
          replyMarkup: {
            inline_keyboard: [[{ text: '✅ Отметить занятие', callback_data: `diary.lfk.session:${complexId}` }]],
          },
        },
      });
      return { actionId: action.id, status: 'success', intents };
    }

    case 'diary.lfk.session': {
      const complexId = asString(action.params.complexId);
      const chatId = asNumber(action.params.chatId);
      const messageId = asNumber(action.params.messageId);
      const callbackQueryId = asString(action.params.callbackQueryId);
      if (!complexId || chatId === null) {
        return { actionId: action.id, status: 'failed', error: 'diary.lfk.session: complexId and chatId required' };
      }
      let userId: string | null = asString(action.params.userId);
      if (!userId && deps.readPort) {
        const source = asString(ctx.event.meta.source) ?? 'telegram';
        const channelUserId = asNumericString(readExternalActorId(ctx))
          ?? asNumericString((ctx.event.payload as { incoming?: { channelUserId?: unknown } })?.incoming?.channelUserId);
        if (channelUserId) {
          const link = await deps.readPort.readDb<{ userId?: string } | null>({
            type: 'user.byIdentity',
            params: { resource: source, externalId: channelUserId },
          });
          userId = link && typeof link === 'object' && typeof link.userId === 'string' ? link.userId : null;
        }
      }
      const intents: OutgoingIntent[] = [];
      if (callbackQueryId) {
        intents.push({ type: 'callback.answer', meta: buildIntentMeta(action, ctx), payload: { callbackQueryId } });
      }
      const port = deps.webappEventsPort;
      if (port && userId) {
        await port.emit({
          eventType: 'diary.lfk.session.created',
          occurredAt: nowIso(ctx),
          payload: { userId, complexId, completedAt: nowIso(ctx) },
        });
      }
      const successText = deps.templatePort
        ? (await renderText({
            templateKey: `${ctx.event.meta.source}:diary.lfk.sessionSuccess`,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Занятие отмечено.'
        : 'Занятие отмечено.';
      intents.push({
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          ...(messageId !== null ? { messageId } : {}),
          message: { text: successText },
          replyMarkup: { inline_keyboard: [[{ text: '⬅️ К списку ЛФК', callback_data: 'diary.lfk.open' }]] },
        },
      });
      return { actionId: action.id, status: 'success', intents };
    }

    case 'diary.lfk.add': {
      const writes: DbWriteMutation[] = [{
        type: 'user.state.set',
        params: {
          resource: ctx.event.meta.source,
          channelUserId: readExternalActorId(ctx),
          state: 'diary.lfk.awaiting_title',
        },
      }];
      await persistWrites(deps.writePort, writes);
      const chatId = asNumber(action.params.chatId);
      const messageId = asNumber(action.params.messageId);
      const callbackQueryId = asString(action.params.callbackQueryId);
      const addTitleText = deps.templatePort
        ? (await renderText({
            templateKey: `${ctx.event.meta.source}:diary.lfk.addTitlePrompt`,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Введите название комплекса ЛФК.'
        : 'Введите название комплекса ЛФК.';
      const intents: OutgoingIntent[] = [];
      if (callbackQueryId) {
        intents.push({ type: 'callback.answer', meta: buildIntentMeta(action, ctx), payload: { callbackQueryId } });
      }
      if (chatId !== null) {
        intents.push({
          type: 'message.edit',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId },
            ...(messageId !== null ? { messageId } : {}),
            message: { text: addTitleText },
            replyMarkup: {
              inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'diary.lfk.back' }]],
            },
          },
        });
      }
      return { actionId: action.id, status: 'success', writes, intents };
    }

    default:
      return {
        actionId: action.id,
        status: 'skipped',
        error: `ACTION_NOT_IMPLEMENTED:${action.type}`,
      };
  }
}
