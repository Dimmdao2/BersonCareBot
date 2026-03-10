import { randomUUID } from 'node:crypto';
import type {
  Action,
  ActionResult,
  DbReadPort,
  DeliveryDefaultsPort,
  NotificationSettings,
  DbWriteMutation,
  DbWritePort,
  DomainContext,
  OutgoingIntent,
  QueuePort,
  TemplatePort,
} from '../../contracts/index.js';
import { applyMessageSendDeliveryPolicy } from './deliveryPolicy.js';

type ExecutorDeps = {
  readPort?: DbReadPort;
  writePort?: DbWritePort;
  queuePort?: QueuePort;
  templatePort?: TemplatePort;
  deliveryDefaultsPort?: DeliveryDefaultsPort | null;
};

function nowIso(ctx: DomainContext): string {
  return ctx.nowIso;
}

function buildDeliveryJob(input: {
  actionId: string;
  params: Record<string, unknown>;
  now: string;
}): { id: string; kind: string; runAt: string; attempts: number; maxAttempts: number; payload: Record<string, unknown> } {
  const kind = typeof input.params.kind === 'string' && input.params.kind.length > 0
    ? input.params.kind
    : 'delivery.intent';
  const runAt = typeof input.params.runAt === 'string' && input.params.runAt.length > 0
    ? input.params.runAt
    : input.now;
  const attemptsRaw = input.params.attempts;
  const maxAttemptsRaw = input.params.maxAttempts;
  const attempts = typeof attemptsRaw === 'number' && Number.isFinite(attemptsRaw)
    ? Math.max(0, Math.trunc(attemptsRaw))
    : 0;
  const maxAttempts = typeof maxAttemptsRaw === 'number' && Number.isFinite(maxAttemptsRaw)
    ? Math.max(1, Math.trunc(maxAttemptsRaw))
    : 3;
  const payload = typeof input.params.payload === 'object' && input.params.payload !== null
    ? input.params.payload as Record<string, unknown>
    : input.params;
  return {
    id: `${kind}:${input.actionId}`,
    kind,
    runAt,
    attempts,
    maxAttempts,
    payload,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNumericString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : null;
}

function readIncoming(ctx: DomainContext): Record<string, unknown> {
  return asRecord(ctx.event.payload.incoming);
}

function readIncomingText(ctx: DomainContext): string | null {
  return asString(readIncoming(ctx).text);
}

function readIncomingChatId(ctx: DomainContext): string | null {
  const incoming = readIncoming(ctx);
  const chatId = asNumber(incoming.chatId);
  return chatId === null ? asString(incoming.chatId) : String(chatId);
}

function readIncomingMessageId(ctx: DomainContext): string | null {
  const incoming = readIncoming(ctx);
  const messageId = asNumber(incoming.messageId);
  return messageId === null ? asString(incoming.messageId) : String(messageId);
}

function readConversationId(action: Action, ctx: DomainContext): string | null {
  return asString(action.params.conversationId)
    ?? asString(ctx.base.replyConversationId)
    ?? asString(readIncoming(ctx).conversationId)
    ?? asString(ctx.base.activeConversationId);
}

function readExternalActorId(ctx: DomainContext): string | null {
  return asString(ctx.event.meta.userId)
    ?? asNumericString(readIncoming(ctx).channelUserId)
    ?? asString(readIncoming(ctx).channelId);
}

function formatActorLabel(input: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  channelId?: string | null;
}): string {
  const name = [input.firstName, input.lastName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .trim();
  const username = asString(input.username);
  if (name && username) return `${name} (@${username})`;
  if (name) return name;
  if (username) return `@${username}`;
  return input.channelId ?? 'user';
}

function buildIntentMeta(action: Action, ctx: DomainContext): OutgoingIntent['meta'] {
  return {
    eventId: `${ctx.event.meta.eventId}:intent:${action.id}`,
    occurredAt: nowIso(ctx),
    source: ctx.event.meta.source,
    ...(ctx.event.meta.correlationId ? { correlationId: ctx.event.meta.correlationId } : {}),
    ...(ctx.event.meta.userId ? { userId: ctx.event.meta.userId } : {}),
  };
}

function defaultNotificationSettings(): NotificationSettings {
  return {
    notify_spb: false,
    notify_msk: false,
    notify_online: false,
  };
}

function readNotificationSettings(ctx: DomainContext): NotificationSettings | null {
  const raw = asRecord(ctx.values.notifications);
  const notify_spb = asBoolean(raw.notify_spb);
  const notify_msk = asBoolean(raw.notify_msk);
  const notify_online = asBoolean(raw.notify_online);
  if (notify_spb === null || notify_msk === null || notify_online === null) return null;
  return { notify_spb, notify_msk, notify_online };
}

function readNotificationToggleState(callbackData: string, settings: NotificationSettings): boolean {
  switch (callbackData) {
    case 'notify_toggle_spb':
    case 'notifications.toggle.spb':
      return settings.notify_spb;
    case 'notify_toggle_msk':
    case 'notifications.toggle.msk':
      return settings.notify_msk;
    case 'notify_toggle_online':
    case 'notifications.toggle.online':
      return settings.notify_online;
    case 'notify_toggle_all':
    case 'notifications.toggle.all':
      return settings.notify_spb && settings.notify_msk && settings.notify_online;
    default:
      return false;
  }
}

function splitTemplateKey(templateKey: string, source: string): { source: string; templateId: string } {
  if (!templateKey.includes(':')) return { source, templateId: templateKey };
  const [templateSource, templateId] = templateKey.split(':', 2);
  return {
    source: templateSource || source,
    templateId: templateId || templateKey,
  };
}

function buildTemplateVars(ctx: DomainContext, vars?: unknown): Record<string, unknown> {
  const explicitVars = isRecord(vars) ? vars : {};
  return {
    ...ctx.values,
    ...explicitVars,
  };
}

function contentAudience(ctx: DomainContext): 'user' | 'admin' {
  return ctx.base?.actor?.isAdmin === true ? 'admin' : 'user';
}

async function renderText(input: {
  text?: unknown;
  messageText?: unknown;
  templateKey?: unknown;
  vars?: unknown;
  ctx: DomainContext;
  templatePort: TemplatePort | undefined;
}): Promise<string> {
  const directText = asString(input.text) ?? asString(input.messageText);
  if (directText) return directText;
  const templateKey = asString(input.templateKey);
  if (!templateKey || !input.templatePort) return '';
  const { source, templateId } = splitTemplateKey(templateKey, input.ctx.event.meta.source);
  return (await input.templatePort.renderTemplate({
    source,
    templateId,
    vars: buildTemplateVars(input.ctx, input.vars),
    audience: contentAudience(input.ctx),
  })).text;
}

async function renderButtonText(input: {
  button: Record<string, unknown>;
  ctx: DomainContext;
  templatePort: TemplatePort | undefined;
  vars?: unknown;
}): Promise<string> {
  const directText = asString(input.button.text);
  if (directText) return directText;
  const templateKey = asString(input.button.textTemplateKey);
  if (!templateKey || !input.templatePort) return '';
  const { source, templateId } = splitTemplateKey(templateKey, input.ctx.event.meta.source);
  const rendered = (await input.templatePort.renderTemplate({
    source,
    templateId,
    vars: buildTemplateVars(input.ctx, input.vars),
    audience: contentAudience(input.ctx),
  })).text;
  const prefixKey = asString(input.button.prefixTemplateKey);
  if (!prefixKey) return rendered;
  const prefix = await renderText({
    templateKey: prefixKey,
    vars: input.vars,
    ctx: input.ctx,
    templatePort: input.templatePort,
  });
  const [enabledPrefix = '✅', disabledPrefix = '❌'] = prefix.split('/');
  const callbackData = asString(input.button.callbackData) ?? '';
  const settings = readNotificationSettings(input.ctx) ?? defaultNotificationSettings();
  const enabled = readNotificationToggleState(callbackData, settings);
  return `${enabled ? enabledPrefix : disabledPrefix} ${rendered}`.trim();
}

async function buildReplyMarkup(input: {
  params: Record<string, unknown>;
  ctx: DomainContext;
  templatePort: TemplatePort | undefined;
  vars?: unknown;
}): Promise<unknown> {
  if (Array.isArray(input.params.keyboard)) {
    const keyboard = await Promise.all(input.params.keyboard.map(async (row) => {
      if (!Array.isArray(row)) return [];
      return Promise.all(row.map(async (item) => {
        const button = asRecord(item);
        return {
          text: await renderButtonText({ button, ctx: input.ctx, templatePort: input.templatePort, vars: input.vars }),
          ...(button.requestContact === true ? { request_contact: true } : {}),
        };
      }));
    }));
    return {
      keyboard,
      resize_keyboard: input.params.resizeKeyboard === true,
      one_time_keyboard: input.params.oneTimeKeyboard === true,
    };
  }

  if (Array.isArray(input.params.inlineKeyboard)) {
    const inline_keyboard = await Promise.all(input.params.inlineKeyboard.map(async (row) => {
      if (!Array.isArray(row)) return [];
      return Promise.all(row.map(async (item) => {
        const button = asRecord(item);
        return {
          text: await renderButtonText({ button, ctx: input.ctx, templatePort: input.templatePort, vars: input.vars }),
          ...(asString(button.callbackData) ? { callback_data: asString(button.callbackData) } : {}),
          ...(asString(button.url) ? { url: asString(button.url) } : {}),
        };
      }));
    }));
    return { inline_keyboard };
  }

  return undefined;
}

async function resolveGenericMessageParams(input: {
  params: Record<string, unknown>;
  ctx: DomainContext;
  templatePort: TemplatePort | undefined;
}): Promise<Record<string, unknown>> {
  const vars = input.params.vars;
  const message = asRecord(input.params.message);
  const text = await renderText({
    text: message.text ?? input.params.text,
    messageText: input.params.messageText,
    templateKey: input.params.templateKey,
    vars,
    ctx: input.ctx,
    templatePort: input.templatePort,
  });
  const replyMarkup = await buildReplyMarkup({
    params: input.params,
    vars,
    ctx: input.ctx,
    templatePort: input.templatePort,
  });

  const nextParams: Record<string, unknown> = {
    ...input.params,
    message: {
      ...message,
      text,
    },
  };

  if (replyMarkup) nextParams.replyMarkup = replyMarkup;

  delete nextParams.templateKey;
  delete nextParams.text;
  delete nextParams.messageText;
  delete nextParams.vars;
  delete nextParams.keyboard;
  delete nextParams.inlineKeyboard;
  delete nextParams.resizeKeyboard;
  delete nextParams.oneTimeKeyboard;

  return nextParams;
}

async function resolveTargets(params: Record<string, unknown>, readPort?: DbReadPort): Promise<Array<{
  resource: string;
  address: Record<string, unknown>;
}>> {
  const explicitTargetsRaw = params.targets;
  if (Array.isArray(explicitTargetsRaw)) {
    const explicitTargets = explicitTargetsRaw
      .map((item) => asRecord(item))
      .filter((item) => asString(item.resource) !== null)
      .map((item) => ({
        resource: asString(item.resource) as string,
        address: asRecord(item.address),
      }));
    if (explicitTargets.length > 0) return explicitTargets;
  }

  const recipient = asRecord(params.recipient);
  const delivery = asRecord(params.delivery);
  const channels = asStringArray(delivery.channels);
  const explicitResource = asString(recipient.resource) ?? asString(recipient.channel);
  const chatId = recipient.chatId;
  if (typeof chatId === 'number' && Number.isFinite(chatId)) {
    const resource = explicitResource ?? channels[0];
    return resource ? [{ resource, address: { chatId } }] : [];
  }

  const phoneNormalized = asString(recipient.phoneNormalized) ?? asString(params.phoneNormalized);
  if (!phoneNormalized) return [];

  if (readPort) {
    const lookup = await readPort.readDb<{ chatId?: number } | null>({
      type: 'user.lookup',
      params: {
        resource: 'channel',
        by: 'phone',
        value: phoneNormalized,
      },
    });
    if (lookup && typeof lookup.chatId === 'number' && Number.isFinite(lookup.chatId)) {
      const resource = explicitResource ?? channels[0];
      return resource
        ? [{ resource, address: { chatId: lookup.chatId, phoneNormalized } }]
        : [];
    }
  }

  const resource = explicitResource ?? channels[0] ?? 'phone';
  return [{ resource, address: { phoneNormalized } }];
}

async function buildMessageDeliverJob(input: {
  action: Action;
  ctx: DomainContext;
  readPort?: DbReadPort;
  deliveryDefaultsPort?: DeliveryDefaultsPort | null;
}): Promise<{ id: string; kind: string; runAt: string; attempts: number; maxAttempts: number; payload: Record<string, unknown> }> {
  const resolvedParams = await applyMessageSendDeliveryPolicy(
    input.action.params,
    input.ctx,
    input.deliveryDefaultsPort,
  );
  const payload = asRecord(resolvedParams.payload);
  const message = asRecord(payload.message);
  const text = asString(message.text) ?? asString(resolvedParams.messageText) ?? '';
  const delivery = asRecord(payload.delivery);
  const channels = asStringArray(delivery.channels);
  const retryRaw = asRecord(resolvedParams.retry);
  const maxAttemptsRaw = retryRaw.maxAttempts ?? resolvedParams.maxAttempts ?? delivery.maxAttempts;
  const maxAttempts = typeof maxAttemptsRaw === 'number' && Number.isFinite(maxAttemptsRaw)
    ? Math.max(1, Math.trunc(maxAttemptsRaw))
    : 1;
  const firstBackoffRaw = Array.isArray(retryRaw.backoffSeconds)
    ? retryRaw.backoffSeconds.find((value) => typeof value === 'number' && Number.isFinite(value))
    : undefined;
  const firstBackoff = typeof firstBackoffRaw === 'number' ? Math.max(0, Math.trunc(firstBackoffRaw)) : 0;
  const targets = await resolveTargets(resolvedParams, input.readPort);

  return {
    id: `delivery:${input.action.id}`,
    kind: 'message.deliver',
    runAt: new Date(Date.parse(input.ctx.nowIso) + firstBackoff * 1000).toISOString(),
    attempts: 0,
    maxAttempts,
    payload: {
      intent: {
        type: 'message.send',
        meta: {
          eventId: `${input.ctx.event.meta.eventId}:delivery:${input.action.id}`,
          occurredAt: input.ctx.nowIso,
          source: input.ctx.event.meta.source,
          ...(input.ctx.event.meta.correlationId ? { correlationId: input.ctx.event.meta.correlationId } : {}),
          ...(input.ctx.event.meta.userId ? { userId: input.ctx.event.meta.userId } : {}),
        },
        payload: {
          message: { text },
          delivery: {
            channels: channels.length > 0 ? channels : targets.map((target) => target.resource),
            maxAttempts,
          },
        },
      },
      targets,
      retry: {
        maxAttempts,
        backoffSeconds: Array.isArray(retryRaw.backoffSeconds)
          ? retryRaw.backoffSeconds.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).map((value) => Math.max(0, Math.trunc(value)))
          : [],
        ...(typeof retryRaw.deadlineAt === 'string' ? { deadlineAt: retryRaw.deadlineAt } : {}),
      },
      ...(resolvedParams.onFail ? { onFail: asRecord(resolvedParams.onFail) } : {}),
    },
  };
}

async function persistWrites(writePort: DbWritePort | undefined, writes: DbWriteMutation[]): Promise<void> {
  if (!writePort) return;
  for (const write of writes) {
    await writePort.writeDb(write);
  }
}

export async function executeAction(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps = {},
): Promise<ActionResult> {
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
          channelUserId: action.params.channelUserId ?? action.params.channelId,
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
      const channelUserId = action.params.channelUserId ?? action.params.channelId;
      const phoneNormalized = asString(action.params.phoneNormalized);
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
        templateKey: action.params.adminTemplateKey ?? 'telegram:adminForward',
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
        ? (await renderText({ templateKey: 'telegram:admin.reply.button', ctx, templatePort: deps.templatePort })) || 'Ответить'
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
          templateKey: 'telegram:admin.conversation.newMessage',
          vars: { userLabel, text },
          ctx,
          templatePort: deps.templatePort,
        })) || `Новое сообщение в диалоге\nОт: ${userLabel}\n\n${text}`
        : `Новое сообщение в диалоге\nОт: ${userLabel}\n\n${text}`;
      const replyButtonText = deps.templatePort
        ? (await renderText({ templateKey: 'telegram:admin.reply.button', ctx, templatePort: deps.templatePort })) || 'Ответить'
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
          ? (await renderText({ templateKey: 'telegram:admin.reply.sent', ctx, templatePort: deps.templatePort })) || 'Сообщение отправлено.'
          : 'Сообщение отправлено.';
        const continueButtonText = deps.templatePort
          ? (await renderText({ templateKey: 'telegram:admin.reply.continueButton', ctx, templatePort: deps.templatePort })) || 'Дополнить ответ'
          : 'Дополнить ответ';
        const closeButtonText = deps.templatePort
          ? (await renderText({ templateKey: 'telegram:admin.dialog.closeButton', ctx, templatePort: deps.templatePort })) || 'Завершить диалог'
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
      const conversation = await deps.readPort.readDb<Record<string, unknown> | null>({
        type: 'conversation.byId',
        params: { id: conversationId },
      });
      const userChatIdRaw = asString(conversation?.user_channel_id);
      const userChatId = userChatIdRaw ? Number(userChatIdRaw) : Number.NaN;
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
      const userClosedText = asString(action.params.userText)
        ?? (deps.templatePort
          ? ((await renderText({ templateKey: 'telegram:dialogClosed', ctx, templatePort: deps.templatePort })) || 'Диалог завершён. Если появятся новые вопросы, напишите новым сообщением.')
          : 'Диалог завершён. Если появятся новые вопросы, напишите новым сообщением.');
      if (Number.isFinite(userChatId) && userClosedText) {
        intents.push({
          type: 'message.send',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId: userChatId },
            message: { text: userClosedText },
            delivery: { maxAttempts: 1 },
          },
        });
      }
      const adminChatId = asNumber(readIncoming(ctx).chatId);
      if (adminChatId !== null) {
        const adminClosedText = deps.templatePort
          ? (await renderText({ templateKey: 'telegram:admin.dialog.closed', ctx, templatePort: deps.templatePort })) || 'Диалог завершён.'
          : 'Диалог завершён.';
        intents.push({
          type: 'message.send',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId: adminChatId },
            message: { text: adminClosedText },
            delivery: { maxAttempts: 1 },
          },
        });
      }
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
        ? (deps.templatePort ? (await renderText({ templateKey: 'telegram:admin.dialogs.empty', ctx, templatePort: deps.templatePort })) || 'Открытых диалогов нет.' : 'Открытых диалогов нет.')
        : (deps.templatePort ? (await renderText({ templateKey: 'telegram:admin.dialogs.list', vars: { listBody }, ctx, templatePort: deps.templatePort })) || `Открытые диалоги:\n\n${listBody}` : `Открытые диалоги:\n\n${listBody}`);
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
        ? (deps.templatePort ? (await renderText({ templateKey: 'telegram:admin.questions.empty', ctx, templatePort: deps.templatePort })) || 'Неотвеченных вопросов нет.' : 'Неотвеченных вопросов нет.')
        : (deps.templatePort ? (await renderText({ templateKey: 'telegram:admin.questions.list', vars: { count: rows.length, listBody: listBodyUnanswered }, ctx, templatePort: deps.templatePort })) || `Неотвеченные вопросы (${rows.length}):\n\n${listBodyUnanswered}` : `Неотвеченные вопросы (${rows.length}):\n\n${listBodyUnanswered}`);
      const filteredRows = rows.filter((item) => asString(item.conversation_id)).slice(0, 15);
      const inline_keyboard = deps.templatePort
        ? await Promise.all(filteredRows.map(async (item) => {
          const label = formatActorLabel({
            firstName: asString(item.first_name),
            lastName: asString(item.last_name),
            username: asString(item.username),
            channelId: asString(item.user_channel_id),
          });
          const btnText = (await renderText({ templateKey: 'telegram:admin.questions.replyButton', vars: { label }, ctx, templatePort: deps.templatePort })) || `Ответить: ${label}`;
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
        ? (await renderText({ templateKey: 'telegram:admin.conversation.show', vars: { label, status }, ctx, templatePort: deps.templatePort })) || `Диалог\nПользователь: ${label}\nСтатус: ${status}`
        : `Диалог\nПользователь: ${label}\nСтатус: ${status}`;
      const replyBtnText = deps.templatePort
        ? (await renderText({ templateKey: 'telegram:admin.reply.button', ctx, templatePort: deps.templatePort })) || 'Ответить'
        : 'Ответить';
      const closeBtnText = deps.templatePort
        ? (await renderText({ templateKey: 'telegram:admin.dialog.closeButton', ctx, templatePort: deps.templatePort })) || 'Завершить диалог'
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
      if (toggleKey === 'notify_toggle_all' && action.params.supportsToggleAll === true) {
        const allEnabled = currentSettings.notify_spb && currentSettings.notify_msk && currentSettings.notify_online;
        nextSettings = {
          notify_spb: !allEnabled,
          notify_msk: !allEnabled,
          notify_online: !allEnabled,
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
