import type { FastifyInstance } from 'fastify';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import type { EventGateway } from '../../kernel/contracts/index.js';
import { maxConfig } from './config.js';
import { maxIncomingToEvent } from './connector.js';
import { fromMax } from './mapIn.js';
import { parseMaxUpdate } from './schema.js';
import { setupMaxCommands } from './setupCommands.js';

export type MaxWebhookDeps = {
  eventGateway: EventGateway;
};

function buildMaxFacts(body: unknown): Record<string, unknown> {
  const data = body as {
    message?: { recipient?: { chat_id?: number } | null; sender?: { user_id?: number } | null } | null;
    chat_id?: number;
    callback?: { user?: { user_id?: number } | null } | null;
    user?: { user_id?: number } | null;
  };
  const adminChatId = maxConfig.adminChatId;
  const adminUserId = maxConfig.adminUserId;
  const chatId = data.message?.recipient?.chat_id ?? data.chat_id;
  const senderUserId = data.callback?.user?.user_id ?? data.message?.sender?.user_id ?? data.user?.user_id;
  const isAdmin =
    (typeof adminUserId === 'number' && typeof senderUserId === 'number' && adminUserId === senderUserId)
    || (typeof adminUserId !== 'number' && typeof adminChatId === 'number' && typeof chatId === 'number' && adminChatId === chatId);
  return {
    ...(typeof adminChatId === 'number' ? { adminChatId } : {}),
    ...(typeof adminUserId === 'number' ? { adminUserId } : {}),
    ...((typeof chatId === 'number' || typeof senderUserId === 'number') ? { isAdmin } : {}),
  };
}

/**
 * Registers MAX webhook route. Flow: secret check -> validate -> map -> eventGateway.
 * Production: set MAX_WEBHOOK_SECRET and ensure HTTPS endpoint is registered with MAX (POST /subscriptions).
 * Blocker: MAX only delivers to HTTPS on port 443; for dev use fixture/long-polling until public URL is ready.
 */
export async function registerMaxWebhookRoutes(
  app: FastifyInstance,
  deps: MaxWebhookDeps,
): Promise<void> {
  await setupMaxCommands();

  app.post('/webhook/max', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    try {
      if (maxConfig.webhookSecret) {
        const headerSecret = request.headers['x-max-bot-api-secret'];
        if (headerSecret !== maxConfig.webhookSecret) {
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

      const event = maxIncomingToEvent({
        incoming,
        correlationId,
        eventId,
        facts: buildMaxFacts(data),
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
