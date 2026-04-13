import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import type { EventGateway } from '../../kernel/contracts/index.js';
import type { IncomingUpdate } from '../../kernel/domain/types.js';
import { telegramIncomingToEvent } from './connector.js';
import { telegramConfig } from './config.js';
import { buildWebappEntryUrl } from '../webappEntryToken.js';
import { parseMessengerStartCommand } from '../common/messengerStartParse.js';
import { normalizeTelegramAction, normalizeTelegramContactPhone, normalizeTelegramMessageAction } from './mapIn.js';
import { getMessageTypeFromTelegramMessage } from './supportRelayTypes.js';
import { ensureNoMenuButtonForUser, setupTelegramMenuButton } from './setupMenuButton.js';
import { parseWebhookBody } from './schema.js';
import type { TelegramWebhookBodyValidated } from './schema.js';

function joinDisplayName(input: { first_name?: string | undefined; last_name?: string | undefined }): string | undefined {
  const parts = [input.first_name, input.last_name]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function buildActorFromBody(body: TelegramWebhookBodyValidated): Record<string, unknown> {
  const from = body.callback_query?.from ?? body.message?.from;
  const displayName = from ? joinDisplayName(from) : undefined;
  return displayName ? { actor: { displayName } } : {};
}

/** Exported for tests: resolves booking deep-link (native cabinet vs BOOKING_URL fallback). */
export async function buildLinksFromBody(
  body: TelegramWebhookBodyValidated,
  resolveIntegratorUserIdForMessenger?: TelegramWebhookDeps['resolveIntegratorUserIdForMessenger'],
): Promise<Record<string, unknown>> {
  const from = body.callback_query?.from ?? body.message?.from;
  const displayName = from ? joinDisplayName(from) : undefined;
  const chatId = body.callback_query?.message?.chat?.id ?? body.message?.chat?.id;
  const links: Record<string, unknown> = {};
  if (typeof chatId === 'number') {
    let integratorUserId: string | undefined;
    try {
      if (typeof from?.id === 'number' && resolveIntegratorUserIdForMessenger) {
        integratorUserId = await resolveIntegratorUserIdForMessenger(String(from.id), 'telegram');
      }
    } catch {
      integratorUserId = undefined;
    }
    const webappEntryUrl = buildWebappEntryUrl({
      chatId,
      ...(displayName !== undefined && displayName !== '' ? { displayName } : {}),
      ...(integratorUserId !== undefined ? { integratorUserId } : {}),
    });
    if (webappEntryUrl) {
      const baseWebappUrl = `${webappEntryUrl}&ctx=bot`;
      links.webappEntryUrl = baseWebappUrl;
      const enc = (p: string) => encodeURIComponent(p);
      links.webappHomeUrl = `${baseWebappUrl}&next=${enc('/app/patient')}`;
      links.webappDiaryUrl = `${baseWebappUrl}&next=${enc('/app/patient/diary?tab=symptoms')}`;
      links.webappCabinetUrl = `${baseWebappUrl}&next=${enc('/app/patient/cabinet')}`;
      links.webappAddressUrl = `${baseWebappUrl}&next=${enc('/app/patient/address')}`;
      links.bookingUrl = links.webappCabinetUrl;
    }
  }
  if (typeof links.bookingUrl !== 'string' && env.BOOKING_URL) {
    links.bookingUrl = env.BOOKING_URL;
  }
  return Object.keys(links).length > 0 ? { links } : {};
}

function buildAdminFacts(body: TelegramWebhookBodyValidated): Record<string, unknown> {
  const adminTelegramId = telegramConfig.adminTelegramId;
  const chatId = body.callback_query?.message?.chat?.id ?? body.message?.chat?.id;
  const isAdmin =
    typeof adminTelegramId === 'number' &&
    typeof chatId === 'number' &&
    chatId === adminTelegramId;
  const result: Record<string, unknown> = typeof isAdmin === 'boolean' ? { isAdmin } : {};
  if (typeof adminTelegramId === 'number') result.adminChatId = adminTelegramId;
  return result;
}

async function buildTelegramFacts(
  body: TelegramWebhookBodyValidated,
  resolveIntegratorUserIdForMessenger?: TelegramWebhookDeps['resolveIntegratorUserIdForMessenger'],
): Promise<Record<string, unknown>> {
  return {
    ...buildActorFromBody(body),
    ...(await buildLinksFromBody(body, resolveIntegratorUserIdForMessenger)),
    ...buildAdminFacts(body),
  };
}

export type TelegramWebhookDeps = {
  eventGateway: EventGateway;
  /** Best-effort integrator `users.id` for webapp-entry token (Phase B); injected from app layer (DB). */
  resolveIntegratorUserIdForMessenger?: (
    externalId: string,
    resource: 'telegram' | 'max',
  ) => Promise<string | undefined>;
};

/** Exported for tests (contact ownership, setphone deep link). */
export function mapBodyToIncoming(body: TelegramWebhookBodyValidated): IncomingUpdate | null {
  if (body.callback_query) {
    const callback = body.callback_query;
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    const telegramId = callback.from?.id;
    const action = normalizeTelegramAction(callback.data ?? '');
    const callbackQueryId = callback.id;
    if (typeof chatId !== 'number' || typeof messageId !== 'number' || typeof telegramId !== 'number') {
      return null;
    }
    return {
      kind: 'callback',
      chatId,
      messageId,
      channelUserId: telegramId,
      action,
      ...(typeof callback.from?.username === 'string' ? { channelUsername: callback.from.username } : {}),
      ...(typeof callback.from?.first_name === 'string' ? { channelFirstName: callback.from.first_name } : {}),
      ...(typeof callback.from?.last_name === 'string' ? { channelLastName: callback.from.last_name } : {}),
      ...(typeof callback.data === 'string' && callback.data.startsWith('admin_reply:')
        ? { conversationId: callback.data.slice('admin_reply:'.length) }
        : {}),
      ...(typeof callback.data === 'string' && callback.data.startsWith('admin_reply_continue:')
        ? { conversationId: callback.data.slice('admin_reply_continue:'.length) }
        : {}),
      ...(typeof callback.data === 'string' && callback.data.startsWith('admin_close_dialog:')
        ? { conversationId: callback.data.slice('admin_close_dialog:'.length) }
        : {}),
      ...(typeof callback.data === 'string' && callback.data.startsWith('dialogs.view:')
        ? { conversationId: callback.data.slice('dialogs.view:'.length) }
        : {}),
      callbackData: action,
      callbackQueryId,
    };
  }

  if (body.message?.from && typeof body.message.chat?.id === 'number') {
    const fromId = body.message.from.id;
    const text = body.message.text ?? '';
    const contact = body.message.contact;
    const contactOwnedBySender =
      typeof contact?.phone_number === 'string' && contact.user_id === fromId;
    const normalizedPhone =
      contactOwnedBySender ? normalizeTelegramContactPhone(contact.phone_number) : null;
    const trimmedText = text.replace(/^\uFEFF+/, '').trim();
    const dictionaryAction = normalizeTelegramMessageAction(text);
    let action = dictionaryAction;
    let recordIdFromStart: string | null = null;
    let linkSecretFromStart: string | null = null;
    let phoneFromSetphoneStart: string | null = null;
    if (trimmedText.startsWith('/start')) {
      const p = parseMessengerStartCommand(trimmedText, dictionaryAction);
      action = p.action;
      if (p.linkSecret !== undefined) linkSecretFromStart = p.linkSecret;
      if (p.recordId !== undefined) recordIdFromStart = p.recordId;
      if (p.phone !== undefined) phoneFromSetphoneStart = p.phone;
    }
    const relayMessageType = getMessageTypeFromTelegramMessage(body.message);
    const phoneOut = phoneFromSetphoneStart ?? normalizedPhone;
    return {
      kind: 'message',
      chatId: body.message.chat.id,
      channelId: String(fromId),
      ...(typeof body.message.message_id === 'number' ? { messageId: body.message.message_id } : {}),
      text,
      action,
      ...(recordIdFromStart ? { recordId: recordIdFromStart } : {}),
      ...(linkSecretFromStart ? { linkSecret: linkSecretFromStart } : {}),
      ...(phoneOut ? { phone: phoneOut } : {}),
      ...(contactOwnedBySender && typeof contact.phone_number === 'string' ? { contactPhone: contact.phone_number } : {}),
      ...(typeof body.message.from.username === 'string' ? { channelUsername: body.message.from.username } : {}),
      ...(typeof body.message.from.first_name === 'string' ? { channelFirstName: body.message.from.first_name } : {}),
      ...(typeof body.message.from.last_name === 'string' ? { channelLastName: body.message.from.last_name } : {}),
      ...(relayMessageType ? { relayMessageType } : {}),
      userRow: null,
      userState: '',
    };
  }

  return null;
}

/**
 * Registers Telegram webhook route in integrations layer.
 * Flow: auth -> validate -> map -> eventGateway.
 */
export async function registerTelegramWebhookRoutes(
  app: FastifyInstance,
  deps: TelegramWebhookDeps,
): Promise<void> {
  const resolveIntegratorUserIdForMessenger = deps.resolveIntegratorUserIdForMessenger;
  await setupTelegramMenuButton();

  app.post('/webhook/telegram', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    try {
      const secret = telegramConfig.webhookSecret;
      if (secret) {
        const headerSecret = request.headers['x-telegram-bot-api-secret-token'];
        if (headerSecret !== secret) {
          reqLogger.warn('telegram webhook secret mismatch');
          return reply.code(200).send({ ok: false, error: 'Forbidden' });
        }
      }

      const parseResult = parseWebhookBody(request.body);
      if (!parseResult.success) {
        reqLogger.warn(
          { err: parseResult.error.flatten(), hasBody: request.body != null },
          'telegram webhook body validation failed',
        );
        return reply.code(200).send({ ok: false, error: 'Invalid webhook body' });
      }

      const body = parseResult.data;
      const incoming = mapBodyToIncoming(body);
      if (!incoming) return reply.code(200).send({ ok: true });

      if (incoming.kind === 'message') {
        const trimmed = incoming.text?.trim() ?? '';
        if (trimmed.startsWith('/start')) {
          reqLogger.debug(
            {
              telegramStart: {
                action: incoming.action ?? '',
                recordIdPresent: typeof incoming.recordId === 'string' && incoming.recordId.length > 0,
                linkSecretPresent: typeof incoming.linkSecret === 'string' && incoming.linkSecret.length > 0,
                phoneFromDeepLink: incoming.action === 'start.setphone' && typeof incoming.phone === 'string',
              },
            },
            '[telegram] /start classified',
          );
        }
      }

      // Убрать кнопку меню у пользователя в личном чате (не админ)
      const chatId = body.callback_query?.message?.chat?.id ?? body.message?.chat?.id;
      const chatType = body.callback_query?.message?.chat?.type ?? body.message?.chat?.type;
      if (typeof chatId === 'number' && chatType === 'private') {
        void ensureNoMenuButtonForUser(chatId);
      }

      const event = telegramIncomingToEvent({
        incoming,
        correlationId,
        eventId,
        facts: await buildTelegramFacts(body, resolveIntegratorUserIdForMessenger),
        ...(typeof body.update_id === 'number' ? { updateId: body.update_id } : {}),
      });
      const result = await deps.eventGateway.handleIncomingEvent(event);
      if (result.status === 'rejected') {
        reqLogger.warn({ reason: result.reason, dedupKey: result.dedupKey }, 'telegram webhook pipeline rejected');
        return reply.code(200).send({ ok: false, error: 'Processing failed' });
      }
      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'telegram webhook failed');
      return reply.code(200).send({ ok: false, error: 'Internal error' });
    }
  });
}
