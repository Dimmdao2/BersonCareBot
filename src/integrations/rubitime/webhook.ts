import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import type { EventGateway } from '../../kernel/contracts/index.js';
import { rubitimeIncomingToEvent } from './connector.js';
import { parseRubitimeBody } from './schema.js';

/** Dependencies for Rubitime webhook handler registration. */
export type RubitimeWebhookDeps = {
  eventGateway: EventGateway;
};

/**
 * Registers Rubitime webhook route in integrations layer.
 * Flow: auth -> validate -> map -> eventGateway.
 */
export async function registerRubitimeWebhookRoutes(
  app: FastifyInstance,
  deps: RubitimeWebhookDeps,
): Promise<void> {
  app.post('/webhook/rubitime/:token', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    try {
      const params = request.params as { token?: string };
      if (params.token !== env.RUBITIME_WEBHOOK_TOKEN) {
        return reply.code(403).send({ ok: false });
      }

      const parseResult = parseRubitimeBody(request.body);
      if (!parseResult.success) {
        reqLogger.warn(
          { err: parseResult.error.flatten(), hasBody: request.body != null },
          'rubitime webhook body validation failed',
        );
        return reply.code(400).send({ ok: false, error: 'Invalid webhook body' });
      }

      const body = parseResult.data;
      reqLogger.info(
        { event: body.event, from: body.from, dataKeys: Object.keys(body.data ?? {}) },
        '[rubitime] webhook received',
      );

      const incomingEvent = rubitimeIncomingToEvent({
        body,
        correlationId,
        eventId,
      });

      const incoming = (incomingEvent.payload as { incoming?: unknown }).incoming;
      reqLogger.info(
        {
          action: (incoming as Record<string, unknown>)?.action,
          entity: (incoming as Record<string, unknown>)?.entity,
          status: (incoming as Record<string, unknown>)?.status,
          phone: (incoming as Record<string, unknown>)?.phone,
          recordId: (incoming as Record<string, unknown>)?.recordId,
        },
        '[rubitime] mapped to event',
      );

      await deps.eventGateway.handleIncomingEvent(incomingEvent);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'rubitime webhook failed');
      return reply.code(200).send({ ok: true });
    }
  });
}
