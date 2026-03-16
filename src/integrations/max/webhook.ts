import type { FastifyInstance } from 'fastify';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import type { EventGateway } from '../../kernel/contracts/index.js';
import { maxConfig } from './config.js';
import { maxIncomingToEvent } from './connector.js';
import { fromMax } from './mapIn.js';
import { parseMaxUpdate } from './schema.js';

export type MaxWebhookDeps = {
  eventGateway: EventGateway;
};

/**
 * Registers MAX webhook route. Flow: secret check -> validate -> map -> eventGateway.
 * Production: set MAX_WEBHOOK_SECRET and ensure HTTPS endpoint is registered with MAX (POST /subscriptions).
 * Blocker: MAX only delivers to HTTPS on port 443; for dev use fixture/long-polling until public URL is ready.
 */
export async function registerMaxWebhookRoutes(
  app: FastifyInstance,
  deps: MaxWebhookDeps,
): Promise<void> {
  app.post('/webhook/max', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    try {
      if (maxConfig.webhookSecret) {
        const headerSecret = request.headers['x-max-bot-api-secret'];
        if (headerSecret !== maxConfig.webhookSecret) {
          return reply.code(403).send({ ok: false });
        }
      }

      const parseResult = parseMaxUpdate(request.body);
      if (!parseResult.success) {
        reqLogger.warn(
          { err: parseResult.error.flatten(), hasBody: request.body != null },
          'max webhook body validation failed',
        );
        return reply.code(400).send({ ok: false, error: 'Invalid webhook body' });
      }

      const incoming = fromMax(parseResult.data);
      if (!incoming) {
        return reply.code(200).send({ ok: true });
      }

      const event = maxIncomingToEvent({
        incoming,
        correlationId,
        eventId,
        facts: {},
      });
      const result = await deps.eventGateway.handleIncomingEvent(event);
      if (result.status === 'rejected') {
        reqLogger.warn({ reason: result.reason, dedupKey: result.dedupKey }, 'max webhook pipeline rejected');
        return reply.code(503).send({ ok: false, error: 'Processing failed' });
      }
      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'max webhook failed');
      return reply.code(500).send({ ok: false, error: 'Internal error' });
    }
  });
}
