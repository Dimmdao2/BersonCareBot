import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import {
  runWithBootstrapPrincipal,
  runWithInfraPrincipal,
  runWithIntegratorPrincipal,
  runWithOrganizationPrincipal,
} from '../../infra/principal/organizationPrincipal.js';
import { getRequestLogger, logger, newEventId } from '../../infra/observability/logger.js';
import type { EventGateway } from '../../kernel/contracts/index.js';
import type { IncomingUpdate } from '../../kernel/domain/types.js';
import { telegramIncomingToEvent } from './connector.js';
import { telegramConfig } from './config.js';
import { buildWebappEntryUrl } from '../webappEntryToken.js';
import { parseMessengerStartCommand } from '../common/messengerStartParse.js';
import {
  incomingCallbackUpdateFromTelegramCallbackQuery,
  normalizeTelegramContactPhone,
  normalizeTelegramMessageAction,
} from './mapIn.js';
import { getMessageTypeFromTelegramMessage } from './supportRelayTypes.js';
import { ensureNoMenuButtonForUser, setupTelegramMenuButton } from './setupMenuButton.js';
import { parseWebhookBody } from './schema.js';
import type { TelegramWebhookBodyValidated } from './schema.js';
import type { ResolveMessengerStaffAdmin } from '../../kernel/contracts/index.js';
import { recordIntegrationWebhookOutcome } from '../../infra/operatorIncident/recordIntegrationWebhookOutcome.js';

type WebhookOutcomeInput = Parameters<typeof recordIntegrationWebhookOutcome>[0];

function recordTelegramWebhookOutcome(input: WebhookOutcomeInput): void {
  void runWithInfraPrincipal({ source: 'telegram-webhook:record-outcome' }, () =>
    recordIntegrationWebhookOutcome(input),
  );
}

function joinDisplayName(input: {
  first_name?: string | undefined;
  last_name?: string | undefined;
}): string | undefined {
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
  getAppBaseUrl?: () => Promise<string>,
): Promise<Record<string, unknown>> {
  const appBaseUrl = getAppBaseUrl ? await getAppBaseUrl() : undefined;
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
    const webappEntryUrl = buildWebappEntryUrl(
      {
        chatId,
        ...(displayName !== undefined && displayName !== '' ? { displayName } : {}),
        ...(integratorUserId !== undefined ? { integratorUserId } : {}),
      },
      appBaseUrl ?? null,
    );
    if (webappEntryUrl) {
      const baseWebappUrl = webappEntryUrl;
      links.webappEntryUrl = baseWebappUrl;
      const enc = (p: string) => encodeURIComponent(p);
      links.webappHomeUrl = `${baseWebappUrl}&next=${enc('/app/patient')}`;
      links.webappRemindersUrl = `${baseWebappUrl}&next=${enc('/app/patient/reminders')}`;
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

/** Exported for tests. */
export async function buildAdminFacts(
  body: TelegramWebhookBodyValidated,
  resolveMessengerStaffAdmin?: ResolveMessengerStaffAdmin,
): Promise<Record<string, unknown>> {
  const adminTelegramId = telegramConfig.adminTelegramId;
  const chatId = body.callback_query?.message?.chat?.id ?? body.message?.chat?.id;
  const envAdmin =
    typeof adminTelegramId === 'number' && typeof chatId === 'number' && chatId === adminTelegramId;
  let dbAdmin = false;
  if (typeof chatId === 'number' && resolveMessengerStaffAdmin) {
    try {
      dbAdmin = await resolveMessengerStaffAdmin('telegram', String(chatId));
    } catch (err) {
      // Fail open like every other pre-routing lookup in this file (all try/catch and default): a
      // transient DB/privilege hiccup here must degrade admin-detection to "not admin", not crash the
      // whole inbound Telegram pipeline (see the 42501 this masked before
      // deploy/postgres/integrator-login-public-identity-grants.sql closed the underlying privilege gap).
      logger.warn(
        { err },
        'buildAdminFacts: resolveMessengerStaffAdmin failed, treating as non-admin',
      );
      dbAdmin = false;
    }
  }
  const isAdmin = envAdmin || dbAdmin;
  const result: Record<string, unknown> = { isAdmin };
  if (typeof adminTelegramId === 'number') result.adminChatId = adminTelegramId;
  return result;
}

async function buildTelegramFacts(
  body: TelegramWebhookBodyValidated,
  resolveIntegratorUserIdForMessenger:
    | TelegramWebhookDeps['resolveIntegratorUserIdForMessenger']
    | undefined,
  getAppBaseUrl: TelegramWebhookDeps['getAppBaseUrl'],
  resolveMessengerStaffAdmin?: ResolveMessengerStaffAdmin,
): Promise<Record<string, unknown>> {
  return {
    ...buildActorFromBody(body),
    ...(await buildLinksFromBody(body, resolveIntegratorUserIdForMessenger, getAppBaseUrl)),
    ...(await buildAdminFacts(body, resolveMessengerStaffAdmin)),
  };
}

export type TelegramWebhookDeps = {
  eventGateway: EventGateway;
  /** Best-effort integrator `users.id` for webapp-entry token (Phase B); injected from app layer (DB). */
  resolveIntegratorUserIdForMessenger?: (
    externalId: string,
    resource: 'telegram' | 'max',
  ) => Promise<string | undefined>;
  /** Публичный deployment origin вебаппа (`APP_BASE_URL`); для ссылок в кнопках WebApp. */
  getAppBaseUrl?: () => Promise<string>;
  /** Staff lists from system_settings (admin_*_ids ∪ doctor_*_ids). */
  resolveMessengerStaffAdmin?: ResolveMessengerStaffAdmin;
  resolveOrganizationIdForMessengerIdentity?: (
    externalId: string,
    resource: 'telegram' | 'max',
  ) => Promise<string | null>;
  /** Exact dedicated bot-instance binding; never falls back to enrollment/default organization. */
  resolveDedicatedClinicBotOrganization?: (credentialFingerprint: string) => Promise<string | null>;
};

function getSourceTelegramExternalId(body: TelegramWebhookBodyValidated): string | null {
  const fromId = body.callback_query?.from?.id ?? body.message?.from?.id;
  return typeof fromId === 'number' ? String(fromId) : null;
}

async function resolveTelegramOrganizationId(
  body: TelegramWebhookBodyValidated,
  deps: TelegramWebhookDeps,
  reqLogger: ReturnType<typeof getRequestLogger>,
): Promise<string | null> {
  const externalId = getSourceTelegramExternalId(body);
  if (externalId && deps.resolveOrganizationIdForMessengerIdentity) {
    try {
      const perUserOrg = await deps.resolveOrganizationIdForMessengerIdentity(
        externalId,
        'telegram',
      );
      if (perUserOrg) return perUserOrg;
    } catch {
      // No enrollment/default fallback: a dedicated bot is resolved by its endpoint binding.
    }
  }
  reqLogger.warn(
    { source: 'telegram' },
    'telegram webhook: no exact organization context for inbound bot message',
  );
  return null;
}

async function resolveTelegramIntegratorUserId(
  body: TelegramWebhookBodyValidated,
  deps: TelegramWebhookDeps,
): Promise<string | null> {
  const externalId = getSourceTelegramExternalId(body);
  if (!externalId || !deps.resolveIntegratorUserIdForMessenger) return null;
  try {
    return (await deps.resolveIntegratorUserIdForMessenger(externalId, 'telegram')) ?? null;
  } catch {
    return null;
  }
}

/** Exported for tests (contact ownership, setphone deep link). */
export function mapBodyToIncoming(body: TelegramWebhookBodyValidated): IncomingUpdate | null {
  if (body.callback_query) {
    return incomingCallbackUpdateFromTelegramCallbackQuery(body.callback_query);
  }

  if (body.message?.from && typeof body.message.chat?.id === 'number') {
    const fromId = body.message.from.id;
    const text = body.message.text ?? '';
    const contact = body.message.contact;
    const contactOwnedBySender =
      typeof contact?.phone_number === 'string' && contact.user_id === fromId;
    const normalizedPhone = contactOwnedBySender
      ? normalizeTelegramContactPhone(contact.phone_number)
      : null;
    const trimmedText = text.replace(/^\uFEFF+/, '').trim();
    const dictionaryAction = normalizeTelegramMessageAction(text);
    let action = dictionaryAction;
    let linkSecretFromStart: string | null = null;
    let authSecretFromStart: string | null = null;
    let phoneFromSetphoneStart: string | null = null;
    if (trimmedText.startsWith('/start')) {
      const p = parseMessengerStartCommand(trimmedText, dictionaryAction);
      action = p.action;
      if (p.linkSecret !== undefined) linkSecretFromStart = p.linkSecret;
      if (p.authSecret !== undefined) authSecretFromStart = p.authSecret;
      if (p.phone !== undefined) phoneFromSetphoneStart = p.phone;
    }
    const relayMessageType = getMessageTypeFromTelegramMessage(body.message);
    const phoneOut = phoneFromSetphoneStart ?? normalizedPhone;
    const replyToRaw = (body.message as { reply_to_message?: { message_id?: number } })
      .reply_to_message;
    const replyToMessageId =
      replyToRaw && typeof replyToRaw.message_id === 'number' ? replyToRaw.message_id : undefined;
    return {
      kind: 'message',
      chatId: body.message.chat.id,
      channelId: String(fromId),
      ...(typeof body.message.message_id === 'number'
        ? { messageId: body.message.message_id }
        : {}),
      ...(replyToMessageId !== undefined ? { replyToMessageId } : {}),
      text,
      action,
      ...(linkSecretFromStart ? { linkSecret: linkSecretFromStart } : {}),
      ...(authSecretFromStart ? { authSecret: authSecretFromStart } : {}),
      ...(phoneOut ? { phone: phoneOut } : {}),
      ...(contactOwnedBySender && typeof contact.phone_number === 'string'
        ? { contactPhone: contact.phone_number }
        : {}),
      ...(typeof body.message.from.username === 'string'
        ? { channelUsername: body.message.from.username }
        : {}),
      ...(typeof body.message.from.first_name === 'string'
        ? { channelFirstName: body.message.from.first_name }
        : {}),
      ...(typeof body.message.from.last_name === 'string'
        ? { channelLastName: body.message.from.last_name }
        : {}),
      ...(relayMessageType ? { relayMessageType } : {}),
      userRow: null,
      userState: '',
    };
  }

  return null;
}

/**
 * Processes ONE validated Telegram update through the event pipeline.
 * Shared by the webhook route AND the long-polling runner so both transports feed
 * the SAME mapBodyToIncoming -> eventGateway flow. Returns the pipeline outcome; the
 * caller decides the transport response (HTTP reply vs. continue polling).
 */
export async function processTelegramUpdate(
  body: TelegramWebhookBodyValidated,
  deps: TelegramWebhookDeps,
  ctx: {
    correlationId: string;
    eventId: string;
    logger: ReturnType<typeof getRequestLogger>;
    dedicatedOrganizationId?: string;
  },
): Promise<{ status: 'ok' | 'ignored' | 'rejected'; reason?: string }> {
  const { correlationId, eventId, logger: reqLogger } = ctx;

  const incoming = mapBodyToIncoming(body);
  if (!incoming) {
    if (body.callback_query) {
      const cq = body.callback_query;
      reqLogger.warn(
        {
          reason: 'telegram_callback_mapper_null',
          updateId: typeof body.update_id === 'number' ? body.update_id : undefined,
          hasChatId: typeof cq.message?.chat?.id === 'number',
          hasMessageId: typeof cq.message?.message_id === 'number',
          hasFromId: typeof cq.from?.id === 'number',
          callbackDataLength: typeof cq.data === 'string' ? cq.data.length : 0,
        },
        'telegram update: callback_query dropped (mapBodyToIncoming returned null)',
      );
    }
    recordTelegramWebhookOutcome({
      source: 'telegram',
      processedOk: true,
      httpStatusReturned: 200,
    });
    return { status: 'ignored' };
  }

  if (incoming.kind === 'message') {
    const trimmed = incoming.text?.trim() ?? '';
    if (trimmed.startsWith('/start')) {
      reqLogger.debug(
        {
          telegramStart: {
            action: incoming.action ?? '',
            linkSecretPresent:
              typeof incoming.linkSecret === 'string' && incoming.linkSecret.length > 0,
            phoneFromDeepLink:
              incoming.action === 'start.setphone' && typeof incoming.phone === 'string',
          },
        },
        '[telegram] /start classified',
      );
    }
  }

  const preRouting = await runWithBootstrapPrincipal(
    { source: 'telegram-webhook:pre-routing' },
    async () => ({
      facts: await buildTelegramFacts(
        body,
        deps.resolveIntegratorUserIdForMessenger,
        deps.getAppBaseUrl,
        deps.resolveMessengerStaffAdmin,
      ),
      organizationId:
        ctx.dedicatedOrganizationId ?? (await resolveTelegramOrganizationId(body, deps, reqLogger)),
      integratorUserId: await resolveTelegramIntegratorUserId(body, deps),
    }),
  );

  // Убрать кнопку меню у пользователя в личном чате (не админ)
  const chatId = body.callback_query?.message?.chat?.id ?? body.message?.chat?.id;
  const chatType = body.callback_query?.message?.chat?.type ?? body.message?.chat?.type;
  if (typeof chatId === 'number' && chatType === 'private') {
    const clearMenu = (): Promise<void> => ensureNoMenuButtonForUser(chatId);
    void (preRouting.organizationId
      ? runWithOrganizationPrincipal(preRouting.organizationId, clearMenu)
      : runWithBootstrapPrincipal(
          { source: 'telegram-webhook:clear-menu-unresolved-org' },
          clearMenu,
        ));
  }

  const event = telegramIncomingToEvent({
    incoming,
    correlationId,
    eventId,
    facts: preRouting.facts,
    ...(typeof body.update_id === 'number' ? { updateId: body.update_id } : {}),
  });
  const organizationId = preRouting.organizationId;
  const integratorUserId = preRouting.integratorUserId;
  const handleEvent = (): Promise<Awaited<ReturnType<EventGateway['handleIncomingEvent']>>> =>
    deps.eventGateway.handleIncomingEvent(event);
  const result =
    organizationId && integratorUserId
      ? await runWithIntegratorPrincipal(
          { organizationId, integratorUserId, source: 'telegram-webhook' },
          handleEvent,
        )
      : organizationId
        ? await runWithOrganizationPrincipal(organizationId, handleEvent)
        : await runWithBootstrapPrincipal(
            { source: 'telegram-webhook:unresolved-org' },
            handleEvent,
          );
  if (result.status === 'rejected') {
    reqLogger.warn(
      { reason: result.reason, dedupKey: result.dedupKey },
      'telegram update pipeline rejected',
    );
    recordTelegramWebhookOutcome({
      source: 'telegram',
      processedOk: false,
      httpStatusReturned: 200,
      errorClass: 'webhook_dispatch_failed',
      detail: result.reason,
    });
    return {
      status: 'rejected',
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
    };
  }
  recordTelegramWebhookOutcome({
    source: 'telegram',
    processedOk: true,
    httpStatusReturned: 200,
  });
  return { status: 'ok' };
}

/**
 * Registers Telegram webhook route in integrations layer.
 * Flow: auth -> validate -> processTelegramUpdate (shared with long-polling).
 */
export async function registerTelegramWebhookRoutes(
  app: FastifyInstance,
  deps: TelegramWebhookDeps,
): Promise<void> {
  // Best-effort, NON-blocking: Telegram API calls here must not stall plugin
  // registration (without egress they used to hang -> Fastify plugin timeout crash).
  void setupTelegramMenuButton();

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
          recordTelegramWebhookOutcome({
            source: 'telegram',
            processedOk: false,
            httpStatusReturned: 200,
            errorClass: 'webhook_auth_failed',
            detail: 'secret mismatch',
          });
          return reply.code(200).send({ ok: false, error: 'Forbidden' });
        }
      }

      const parseResult = parseWebhookBody(request.body);
      if (!parseResult.success) {
        reqLogger.warn(
          { err: parseResult.error.flatten(), hasBody: request.body != null },
          'telegram webhook body validation failed',
        );
        recordTelegramWebhookOutcome({
          source: 'telegram',
          processedOk: false,
          httpStatusReturned: 200,
          errorClass: 'webhook_parse_failed',
          detail: 'body validation failed',
        });
        return reply.code(200).send({ ok: false, error: 'Invalid webhook body' });
      }

      const outcome = await processTelegramUpdate(parseResult.data, deps, {
        correlationId,
        eventId,
        logger: reqLogger,
      });
      if (outcome.status === 'rejected') {
        return reply.code(200).send({ ok: false, error: 'Processing failed' });
      }
      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'telegram webhook failed');
      const msg = err instanceof Error ? err.message : String(err);
      recordTelegramWebhookOutcome({
        source: 'telegram',
        processedOk: false,
        httpStatusReturned: 200,
        errorClass: 'webhook_internal_error',
        detail: msg,
      });
      return reply.code(200).send({ ok: false, error: 'Internal error' });
    }
  });

  app.post<{ Params: { credentialFingerprint: string } }>(
    '/webhook/telegram/dedicated/:credentialFingerprint',
    async (request, reply) => {
      const correlationId = request.id;
      const eventId = newEventId('incoming');
      const reqLogger = getRequestLogger(request.id, { correlationId, eventId });
      const fingerprint = request.params.credentialFingerprint;
      const organizationId = await deps.resolveDedicatedClinicBotOrganization?.(fingerprint);
      if (!organizationId) {
        reqLogger.warn({ source: 'telegram' }, 'telegram dedicated webhook: unknown bot binding');
        recordTelegramWebhookOutcome({
          source: 'telegram',
          processedOk: false,
          httpStatusReturned: 200,
          errorClass: 'webhook_auth_failed',
          detail: 'unknown dedicated bot binding',
        });
        return reply.code(200).send({ ok: false, error: 'Unknown bot' });
      }
      const parseResult = parseWebhookBody(request.body);
      if (!parseResult.success) {
        recordTelegramWebhookOutcome({
          source: 'telegram',
          processedOk: false,
          httpStatusReturned: 200,
          errorClass: 'webhook_parse_failed',
          detail: 'body validation failed',
        });
        return reply.code(200).send({ ok: false, error: 'Invalid webhook body' });
      }
      const outcome = await processTelegramUpdate(parseResult.data, deps, {
        correlationId,
        eventId,
        logger: reqLogger,
        dedicatedOrganizationId: organizationId,
      });
      return reply.code(200).send({ ok: outcome.status !== 'rejected' });
    },
  );
}
