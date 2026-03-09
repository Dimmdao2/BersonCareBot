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
          delivery: { channels: ['telegram'], maxAttempts: 1 },
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
