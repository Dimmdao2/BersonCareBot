import type { FastifyInstance } from 'fastify';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import type { EventGateway } from '../../kernel/contracts/index.js';
import { buildWebappEntryUrlForMax } from '../webappEntryToken.js';
import { maxConfig } from './config.js';
import { maxIncomingToEvent } from './connector.js';
import { fromMax } from './mapIn.js';
import { parseMaxUpdate } from './schema.js';
import { getMaxWebhookSecret } from './runtimeConfig.js';
import { setupMaxCommands } from './setupCommands.js';
import type { MaxUpdateValidated } from './schema.js';

export type MaxWebhookDeps = {
  eventGateway: EventGateway;
  resolveIntegratorUserIdForMessenger?: (
    externalId: string,
    resource: 'telegram' | 'max',
  ) => Promise<string | undefined>;
  getAppBaseUrl?: () => Promise<string>;
};

/** Экспорт для тестов контракта URL miniapp (`/app/max`, `next=`). */
export async function buildMaxLinks(
  data: MaxUpdateValidated,
  resolveIntegratorUserIdForMessenger: MaxWebhookDeps['resolveIntegratorUserIdForMessenger'] | undefined,
  appBaseUrl: string | undefined,
): Promise<Record<string, unknown>> {
  const maxId = data.message?.sender?.user_id ?? data.callback?.user?.user_id ?? data.user?.user_id;
  if (maxId == null || typeof maxId !== 'number') return {};
  const sender = data.message?.sender ?? data.callback?.user ?? data.user;
  const displayName =
    sender?.first_name != null || sender?.last_name != null
      ? [sender?.first_name, sender?.last_name].filter(Boolean).join(' ').trim() || undefined
      : sender?.name ?? undefined;
  let integratorUserId: string | undefined;
  try {
    if (resolveIntegratorUserIdForMessenger) {
      integratorUserId = await resolveIntegratorUserIdForMessenger(String(maxId), 'max');
    }
  } catch {
    integratorUserId = undefined;
  }
  const webappEntryUrl = buildWebappEntryUrlForMax(
    {
      maxId: String(maxId),
      ...(displayName ? { displayName } : {}),
      ...(integratorUserId !== undefined ? { integratorUserId } : {}),
    },
    appBaseUrl,
  );
  if (!webappEntryUrl) return {};
  const baseWebappUrl = webappEntryUrl;
  const enc = (p: string) => encodeURIComponent(p);
  return {
    links: {
      webappEntryUrl: baseWebappUrl,
      webappHomeUrl: `${baseWebappUrl}&next=${enc('/app/patient')}`,
      webappRemindersUrl: `${baseWebappUrl}&next=${enc('/app/patient/reminders')}`,
      webappDiaryUrl: `${baseWebappUrl}&next=${enc('/app/patient/diary?tab=symptoms')}`,
      webappCabinetUrl: `${baseWebappUrl}&next=${enc('/app/patient/cabinet')}`,
      webappAddressUrl: `${baseWebappUrl}&next=${enc('/app/patient/address')}`,
      bookingUrl: `${baseWebappUrl}&next=${enc('/app/patient/cabinet')}`,
    },
  };
}

async function buildMaxFacts(
  data: MaxUpdateValidated,
  resolveIntegratorUserIdForMessenger: MaxWebhookDeps['resolveIntegratorUserIdForMessenger'] | undefined,
  getAppBaseUrl: MaxWebhookDeps['getAppBaseUrl'],
): Promise<Record<string, unknown>> {
  const appBaseUrl = getAppBaseUrl ? await getAppBaseUrl() : undefined;
  const adminChatId = maxConfig.adminChatId;
  const adminUserId = maxConfig.adminUserId;
  const chatId = data.message?.recipient?.chat_id ?? data.chat_id;
  const senderUserId = data.callback?.user?.user_id ?? data.message?.sender?.user_id ?? data.user?.user_id;
  const isAdmin =
    (typeof adminUserId === 'number' && typeof senderUserId === 'number' && adminUserId === senderUserId)
    || (typeof adminUserId !== 'number' && typeof adminChatId === 'number' && typeof chatId === 'number' && adminChatId === chatId);
  return {
    ...(await buildMaxLinks(data, resolveIntegratorUserIdForMessenger, appBaseUrl)),
    ...(typeof adminChatId === 'number' ? { adminChatId } : {}),
    ...(typeof adminUserId === 'number' ? { adminUserId } : {}),
    ...((typeof chatId === 'number' || typeof senderUserId === 'number') ? { isAdmin } : {}),
  };
}

/**
 * Registers MAX webhook route. Flow: secret check -> validate -> map -> eventGateway.
 * Production: set MAX webhook secret in env (MAX_WEBHOOK_SECRET) and ensure HTTPS endpoint is registered with MAX (POST /subscriptions).
 * Blocker: MAX only delivers to HTTPS on port 443; for dev use fixture/long-polling until public URL is ready.
 */
export async function registerMaxWebhookRoutes(
  app: FastifyInstance,
  deps: MaxWebhookDeps,
): Promise<void> {
  await setupMaxCommands();
  const resolveIntegratorUserIdForMessenger = deps.resolveIntegratorUserIdForMessenger;
  const getAppBaseUrl = deps.getAppBaseUrl;

  app.post('/webhook/max', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    try {
      const webhookSecret = await getMaxWebhookSecret();
      if (webhookSecret) {
        const headerSecret = request.headers['x-max-bot-api-secret'];
        if (headerSecret !== webhookSecret) {
          reqLogger.warn('max webhook secret mismatch');
          return reply.code(200).send({ ok: false, error: 'Forbidden' });
        }
      }

      const parseResult = parseMaxUpdate(request.body);
      if (!parseResult.success) {
        reqLogger.warn(
          { err: parseResult.error.flatten(), hasBody: request.body != null },
          'max webhook body validation failed',
        );
        return reply.code(200).send({ ok: false, error: 'Invalid webhook body' });
      }

      const data = parseResult.data;
      reqLogger.info(
        {
          update_type: data.update_type,
          has_message: data.message != null,
          has_callback: data.callback != null,
          recipient_chat_id: data.message?.recipient?.chat_id,
          recipient_user_id: data.message?.recipient?.user_id,
          sender_user_id: data.message?.sender?.user_id,
        },
        'max webhook received',
      );

      const incoming = fromMax(data);
      if (!incoming) {
        reqLogger.info({ update_type: data.update_type }, 'max webhook skipped (unsupported or missing chatId/userId)');
        return reply.code(200).send({ ok: true });
      }

      if (incoming.kind === 'message') {
        const trimmed = incoming.text?.trim() ?? '';
        if (trimmed.startsWith('/start')) {
          reqLogger.debug(
            {
              maxStart: {
                action: incoming.action ?? '',
                recordIdPresent: typeof incoming.recordId === 'string' && incoming.recordId.length > 0,
                linkSecretPresent: typeof incoming.linkSecret === 'string' && incoming.linkSecret.length > 0,
                phoneFromDeepLink: incoming.action === 'start.setphone' && typeof incoming.phone === 'string',
              },
            },
            '[max] /start classified',
          );
        }
      }

      const event = maxIncomingToEvent({
        incoming,
        correlationId,
        eventId,
        facts: await buildMaxFacts(parseResult.data, resolveIntegratorUserIdForMessenger, getAppBaseUrl),
      });
      const result = await deps.eventGateway.handleIncomingEvent(event);
      if (result.status === 'rejected') {
        reqLogger.warn({ reason: result.reason, dedupKey: result.dedupKey }, 'max webhook pipeline rejected');
        return reply.code(200).send({ ok: false, error: 'Processing failed' });
      }
      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'max webhook failed');
      return reply.code(200).send({ ok: false, error: 'Internal error' });
    }
  });
}
