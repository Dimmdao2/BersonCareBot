/**
 * Shared types and helpers for the executor. Used by the dispatcher and by handler modules.
 * Handlers must not import integrations; they use only ctx.base.facts, ctx.event, action params, and ports.
 */
import type {
  Action,
  ActionResult,
  ContentCatalogPort,
  ContentPort,
  DbReadPort,
  DeliveryDefaultsPort,
  DeliveryTargetsPort,
  DispatchPort,
  DomainContext,
  NotificationSettings,
  DbWriteMutation,
  DbWritePort,
  OutgoingIntent,
  ProtectedAccessPort,
  QueuePort,
  RemindersWebappWritesPort,
  TemplatePort,
  WebappEventsPort,
} from '../../contracts/index.js';
import { applyMessageSendDeliveryPolicy } from './deliveryPolicy.js';
import { logger } from '../../../infra/observability/logger.js';

/** Policy for support relay: which message types are allowed user→admin and admin→user. */
export type SupportRelayPolicy = {
  isAllowedUserToAdmin(messageType: string): boolean;
  isAllowedAdminToUser(messageType: string): boolean;
};

export type ExecutorDeps = {
  readPort?: DbReadPort;
  writePort?: DbWritePort;
  /** Used e.g. for data-quality Telegram alerts when resolving display timezone from DB. */
  dispatchPort?: DispatchPort;
  queuePort?: QueuePort;
  templatePort?: TemplatePort;
  deliveryDefaultsPort?: DeliveryDefaultsPort | null;
  contentCatalogPort?: ContentCatalogPort | null;
  protectedAccessPort?: ProtectedAccessPort | null;
  /** When true, attach main reply keyboard (from replyMenu.json) to user `message.send` / `message.compose` only if `ctx.base.linkedPhone === true`. */
  sendMenuOnButtonPress?: boolean;
  contentPort?: ContentPort;
  /** Policy for support relay message types. When set, relay checks allowed types and uses copyMessage where applicable. */
  supportRelayPolicy?: SupportRelayPolicy | null;
  /** Set by pipeline so handlers can recurse (e.g. message.retry.enqueue). */
  executeAction?: (action: Action, ctx: DomainContext, deps: ExecutorDeps) => Promise<ActionResult>;
  /** Optional: emit signed events to webapp (e.g. diary.symptom.*). */
  webappEventsPort?: WebappEventsPort;
  /** Optional: resolve delivery targets by phone/channel for multi-channel fan-out (e.g. Rubitime/booking). */
  deliveryTargetsPort?: DeliveryTargetsPort;
  /** Optional: webapp journal + occurrence_history for reminder snooze/skip from bot callbacks. */
  remindersWebappWritesPort?: RemindersWebappWritesPort;
};

export function nowIso(ctx: DomainContext): string {
  return ctx.nowIso;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asMessageId(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return null;
}

export function asNumericString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : null;
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+') && /^\+\d{10,15}$/.test(digits)) return digits;
  const onlyDigits = digits.replace(/\D/g, '');
  if (onlyDigits.length === 11 && onlyDigits.startsWith('8')) return `+7${onlyDigits.slice(1)}`;
  if (onlyDigits.length === 11 && onlyDigits.startsWith('7')) return `+${onlyDigits}`;
  if (onlyDigits.length === 10) return `+7${onlyDigits}`;
  if (onlyDigits.length >= 10 && onlyDigits.length <= 15) return `+${onlyDigits}`;
  return null;
}

export function readIncoming(ctx: DomainContext): Record<string, unknown> {
  return asRecord(ctx.event.payload.incoming);
}

export function readIncomingText(ctx: DomainContext): string | null {
  return asString(readIncoming(ctx).text);
}

export function readIncomingPhone(ctx: DomainContext): string | null {
  const incoming = readIncoming(ctx);
  return asString(incoming.phone)
    ?? (asString(incoming.contactPhone) ? normalizePhone(asString(incoming.contactPhone) as string) : null);
}

export function readIncomingChatId(ctx: DomainContext): string | null {
  const incoming = readIncoming(ctx);
  const chatId = asNumber(incoming.chatId);
  return chatId === null ? asString(incoming.chatId) : String(chatId);
}

export function readIncomingMessageId(ctx: DomainContext): string | null {
  const incoming = readIncoming(ctx);
  const messageId = asMessageId(incoming.messageId);
  return messageId === null ? null : String(messageId);
}

/** Тип сообщения для support relay (text, photo, document, …). Только у message. */
export function readRelayMessageType(ctx: DomainContext): string | null {
  const incoming = readIncoming(ctx);
  if (incoming.kind !== 'message') return null;
  return asString(incoming.relayMessageType);
}

export function readConversationId(action: Action, ctx: DomainContext): string | null {
  return asString(action.params.conversationId)
    ?? asString(ctx.base.replyConversationId)
    ?? asString(readIncoming(ctx).conversationId)
    ?? asString(ctx.base.activeConversationId);
}

export function readExternalActorId(ctx: DomainContext): string | null {
  return asString(ctx.event.meta.userId)
    ?? asNumericString(readIncoming(ctx).channelUserId)
    ?? asString(readIncoming(ctx).channelId);
}

export function formatActorLabel(input: {
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

export function buildIntentMeta(action: Action, ctx: DomainContext): OutgoingIntent['meta'] {
  return {
    eventId: `${ctx.event.meta.eventId}:intent:${action.id}`,
    occurredAt: nowIso(ctx),
    source: ctx.event.meta.source,
    ...(ctx.event.meta.correlationId ? { correlationId: ctx.event.meta.correlationId } : {}),
    ...(ctx.event.meta.userId ? { userId: ctx.event.meta.userId } : {}),
  };
}

export function defaultNotificationSettings(): NotificationSettings {
  return {
    notify_spb: true,
    notify_msk: true,
    notify_online: true,
    notify_bookings: true,
  };
}

export function readNotificationSettings(ctx: DomainContext): NotificationSettings | null {
  const raw = asRecord(ctx.values.notifications);
  const notify_spb = asBoolean(raw.notify_spb);
  const notify_msk = asBoolean(raw.notify_msk);
  const notify_online = asBoolean(raw.notify_online);
  const notify_bookings = asBoolean(raw.notify_bookings);
  if (notify_spb === null || notify_msk === null || notify_online === null || notify_bookings === null) return null;
  return { notify_spb, notify_msk, notify_online, notify_bookings };
}

export function readNotificationToggleState(callbackData: string, settings: NotificationSettings): boolean {
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
    case 'notify_toggle_bookings':
    case 'notifications.toggle.bookings':
      return settings.notify_bookings;
    case 'notify_toggle_all':
    case 'notifications.toggle.all':
      return settings.notify_spb && settings.notify_msk && settings.notify_online && settings.notify_bookings;
    default:
      return false;
  }
}

export function splitTemplateKey(templateKey: string, source: string): { source: string; templateId: string } {
  if (!templateKey.includes(':')) return { source, templateId: templateKey };
  const [templateSource, templateId] = templateKey.split(':', 2);
  return {
    source: templateSource || source,
    templateId: templateId || templateKey,
  };
}

export function buildTemplateVars(ctx: DomainContext, vars?: unknown): Record<string, unknown> {
  const explicitVars = isRecord(vars) ? vars : {};
  return {
    ...ctx.values,
    ...explicitVars,
  };
}

export function contentAudience(ctx: DomainContext): 'user' | 'admin' {
  return ctx.base?.actor?.isAdmin === true ? 'admin' : 'user';
}

export async function buildMainReplyKeyboardMarkup(input: {
  ctx: DomainContext;
  templatePort: TemplatePort | undefined;
  contentPort: ContentPort | undefined;
}): Promise<unknown | undefined> {
  if (contentAudience(input.ctx) !== 'user' || !input.templatePort || !input.contentPort) return undefined;
  const scope = { source: input.ctx.event.meta.source, audience: 'user' as const };
  const bundle = await input.contentPort.getBundle?.(scope);
  if (!bundle?.mainReplyKeyboard || !Array.isArray(bundle.mainReplyKeyboard)) return undefined;
  return buildReplyMarkup({
    params: { keyboard: bundle.mainReplyKeyboard, resizeKeyboard: true },
    ctx: input.ctx,
    templatePort: input.templatePort,
  });
}

/**
 * Главное инлайн-меню MAX (`menus.main` из бандла max/user): три WebApp-кнопки, если заданы facts с URL.
 * Не зависит от `ctx.event.meta.source` — используется при исходящей доставке в канал `max`.
 */
export async function buildMaxMainInlineKeyboardMarkup(input: {
  ctx: DomainContext;
  templatePort: TemplatePort | undefined;
  contentPort: ContentPort | undefined;
}): Promise<unknown | undefined> {
  if (contentAudience(input.ctx) !== 'user' || !input.templatePort || !input.contentPort?.getBundle) return undefined;
  const bundle = await input.contentPort.getBundle({ source: 'max', audience: 'user' });
  const menus = bundle?.menus;
  if (!menus || typeof menus !== 'object') {
    logger.warn('max main inline menu: missing menus in max/user bundle');
    return undefined;
  }
  const main = (menus as Record<string, unknown>).main;
  if (!Array.isArray(main) || main.length === 0) {
    logger.warn('max main inline menu: menus.main empty');
    return undefined;
  }
  return buildReplyMarkup({
    params: { inlineKeyboard: main },
    ctx: input.ctx,
    templatePort: input.templatePort,
  });
}

export async function renderText(input: {
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

export async function renderButtonText(input: {
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

export function isPhoneRequestButton(button: Record<string, unknown>): boolean {
  return button.requestPhone === true || button.requestContact === true;
}

/** Get value from object by dot path (e.g. "links.webappEntryUrl"). */
function getFactByPath(facts: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.').filter((s) => s.length > 0);
  let current: unknown = facts;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

export async function buildReplyMarkup(input: {
  params: Record<string, unknown>;
  ctx: DomainContext;
  templatePort: TemplatePort | undefined;
  vars?: unknown;
}): Promise<unknown> {
  if (Array.isArray(input.params.keyboard)) {
    const facts = asRecord(input.ctx.base?.facts ?? {});
    const keyboard = await Promise.all(input.params.keyboard.map(async (row) => {
      if (!Array.isArray(row)) return [];
      return Promise.all(row.map(async (item) => {
        const button = asRecord(item);
        const text = await renderButtonText({ button, ctx: input.ctx, templatePort: input.templatePort, vars: input.vars });
        const webAppUrlFact = asString(button.webAppUrlFact);
        const webAppUrl = webAppUrlFact
          ? (getFactByPath(facts, webAppUrlFact) as string | undefined)
          : undefined;
        const webAppUrlString = typeof webAppUrl === 'string' && webAppUrl.trim().length > 0 ? webAppUrl.trim() : null;
        return {
          text,
          ...(webAppUrlString ? { web_app: { url: webAppUrlString } } : {}),
          ...(isPhoneRequestButton(button) ? { request_contact: true } : {}),
        };
      }));
    }));
    const containsPhoneRequest = input.params.keyboard.some((row) =>
      Array.isArray(row) && row.some((item) => isPhoneRequestButton(asRecord(item))),
    );
    if (containsPhoneRequest) {
      const cancelButtonText = (await renderText({
        templateKey: `${input.ctx.event.meta.source}:requestPhone.cancelButton`,
        vars: input.vars,
        ctx: input.ctx,
        templatePort: input.templatePort,
      })) || 'Вернуться в меню';
      const hasCancelButton = keyboard.some((row) =>
        Array.isArray(row) && row.some((btn) => {
          const b = asRecord(btn);
          return asString(b.text) === cancelButtonText && !b.request_contact;
        }),
      );
      if (!hasCancelButton) {
        keyboard.push([{ text: cancelButtonText }]);
      }
    }
    const oneTime = input.params.oneTimeKeyboard === true;
    return {
      keyboard,
      resize_keyboard: input.params.resizeKeyboard === true,
      one_time_keyboard: oneTime,
      /** Bot API 6.6+: main menu stays visible; avoids collapse to the input-field keyboard icon (iOS). */
      ...(!oneTime ? { is_persistent: true } : {}),
    };
  }

  if (Array.isArray(input.params.inlineKeyboard)) {
    const facts = asRecord(input.ctx.base?.facts ?? {});
    const inline_keyboard = await Promise.all(input.params.inlineKeyboard.map(async (row) => {
      if (!Array.isArray(row)) return [];
      return Promise.all(row.map(async (item) => {
        const button = asRecord(item);
        const text = await renderButtonText({ button, ctx: input.ctx, templatePort: input.templatePort, vars: input.vars });
        if (isPhoneRequestButton(button)) {
          return { text, request_contact: true };
        }
        const webAppUrlFact = asString(button.webAppUrlFact);
        const webAppUrl = webAppUrlFact
          ? (getFactByPath(facts, webAppUrlFact) as string | undefined)
          : undefined;
        const urlStr = typeof webAppUrl === 'string' && webAppUrl.trim().length > 0 ? webAppUrl.trim() : null;
        if (urlStr) {
          return { text, web_app: { url: urlStr } };
        }
        return {
          text,
          ...(asString(button.callbackData) ? { callback_data: asString(button.callbackData) } : {}),
          ...(asString(button.url) ? { url: asString(button.url) } : {}),
        };
      }));
    }));
    return { inline_keyboard };
  }

  return undefined;
}

export async function resolveGenericMessageParams(input: {
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

  const parseMode = input.params.parseMode === 'HTML' || input.params.parseMode === 'Markdown'
    ? input.params.parseMode
    : undefined;
  if (parseMode) nextParams.parse_mode = parseMode;

  delete nextParams.templateKey;
  delete nextParams.text;
  delete nextParams.messageText;
  delete nextParams.vars;
  delete nextParams.keyboard;
  delete nextParams.inlineKeyboard;
  delete nextParams.resizeKeyboard;
  delete nextParams.oneTimeKeyboard;
  delete nextParams.parseMode;

  return nextParams;
}

export async function resolveTargets(
  params: Record<string, unknown>,
  opts?: { readPort?: DbReadPort; deliveryTargetsPort?: DeliveryTargetsPort | null },
): Promise<Array<{ resource: string; address: Record<string, unknown> }>> {
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

  const deliveryTargetsPort = opts?.deliveryTargetsPort;
  if (deliveryTargetsPort) {
    const bindings = await deliveryTargetsPort.getTargetsByPhone(phoneNormalized);
    if (bindings && typeof bindings === 'object') {
      const targets: Array<{ resource: string; address: Record<string, unknown> }> = [];
      const telegramId = typeof bindings.telegramId === 'string' && bindings.telegramId.trim().length > 0
        ? bindings.telegramId.trim()
        : null;
      const maxId = typeof bindings.maxId === 'string' && bindings.maxId.trim().length > 0
        ? bindings.maxId.trim()
        : null;
      const resource = explicitResource ?? channels[0];
      if (telegramId && (!resource || resource === 'telegram')) {
        const cid = Number(telegramId);
        targets.push({
          resource: 'telegram',
          address: Number.isFinite(cid) ? { chatId: cid } : { channelId: telegramId },
        });
      }
      if (maxId && (!resource || resource === 'max')) {
        targets.push({ resource: 'max', address: { channelId: maxId } });
      }
      if (targets.length > 0) return targets;
    }
    return [{ resource: explicitResource ?? channels[0] ?? 'phone', address: { phoneNormalized } }];
  }

  const readPort = opts?.readPort;
  if (readPort) {
    const lookup = await readPort.readDb<{ chatId?: number } | null>({
      type: 'user.lookup',
      params: { resource: 'channel', by: 'phone', value: phoneNormalized },
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

export function buildDeliveryJob(input: {
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

export async function buildMessageDeliverJob(input: {
  action: Action;
  ctx: DomainContext;
  readPort?: DbReadPort;
  deliveryDefaultsPort?: DeliveryDefaultsPort | null;
  deliveryTargetsPort?: DeliveryTargetsPort | null;
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
  const opts: { readPort?: DbReadPort; deliveryTargetsPort?: DeliveryTargetsPort | null } = {};
  if (input.readPort !== undefined) opts.readPort = input.readPort;
  if (input.deliveryTargetsPort !== undefined) opts.deliveryTargetsPort = input.deliveryTargetsPort;
  const targets = await resolveTargets(resolvedParams, opts);

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

export async function persistWrites(writePort: DbWritePort | undefined, writes: DbWriteMutation[]): Promise<void> {
  if (!writePort) return;
  for (const write of writes) {
    await writePort.writeDb(write);
  }
}

/**
 * Builds an intent to send a message to the admin chat with optional inline buttons.
 * Use for admin-facing replies (dialogs, confirmations, lists).
 */
export function sendAdminMessage(input: {
  action: Action;
  ctx: DomainContext;
  text: string;
  buttons?: Array<Array<{ text: string; callback_data?: string }>>;
}): OutgoingIntent {
  const adminChatId = asNumber(asRecord(input.ctx.base.facts).adminChatId);
  if (adminChatId === null) {
    return {
      type: 'message.send',
      meta: buildIntentMeta(input.action, input.ctx),
      payload: {
        recipient: {},
        message: { text: input.text },
        delivery: { maxAttempts: 1 },
      },
    };
  }
  return {
    type: 'message.send',
    meta: buildIntentMeta(input.action, input.ctx),
    payload: {
      recipient: { chatId: adminChatId },
      message: { text: input.text },
      ...(input.buttons && input.buttons.length > 0 ? { replyMarkup: { inline_keyboard: input.buttons } } : {}),
      delivery: { maxAttempts: 1 },
    },
  };
}
