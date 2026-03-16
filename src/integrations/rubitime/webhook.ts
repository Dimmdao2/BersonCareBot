import type { FastifyInstance } from 'fastify';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import type { EventGateway, GatewayResult } from '../../kernel/contracts/index.js';
import { fetchRubitimeRecordById } from './client.js';
import { rubitimeIncomingToEvent } from './connector.js';
import { rubitimeConfig } from './config.js';
import { parseRubitimeBody } from './schema.js';

/** Dependencies for Rubitime webhook handler registration. */
export type RubitimeWebhookDeps = {
  eventGateway: EventGateway;
};

async function processRubitimeBody(input: {
  body: { from: string; event: 'event-create-record' | 'event-update-record' | 'event-remove-record' | 'event-delete-record'; data: Record<string, unknown> };
  correlationId: string;
  eventId: string;
  requestId: string;
  eventGateway: EventGateway;
}): Promise<GatewayResult> {
  const reqLogger = getRequestLogger(input.requestId, {
    correlationId: input.correlationId,
    eventId: input.eventId,
  });
  reqLogger.info(
    { event: input.body.event, from: input.body.from, dataKeys: Object.keys(input.body.data ?? {}) },
    '[rubitime] webhook received',
  );

  const incomingEvent = rubitimeIncomingToEvent({
    body: input.body,
    correlationId: input.correlationId,
    eventId: input.eventId,
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

  return input.eventGateway.handleIncomingEvent(incomingEvent);
}

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
      if (params.token !== rubitimeConfig.webhookToken) {
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

      const result = await processRubitimeBody({
        body: parseResult.data,
        correlationId,
        eventId,
        requestId: request.id,
        eventGateway: deps.eventGateway,
      });
      if (result?.status === 'rejected') {
        reqLogger.warn({ reason: result.reason }, 'rubitime webhook pipeline rejected');
        return reply.code(503).send({ ok: false, error: 'Processing failed' });
      }
      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'rubitime webhook failed');
      return reply.code(500).send({ ok: false, error: 'Internal error' });
    }
  });

  app.get('/api/rubitime', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    const params = request.query as { record_success?: string; token?: string };
    if (params.token !== rubitimeConfig.webhookToken) {
      return reply.code(403).send({ ok: false, error: 'Missing or invalid token' });
    }

    try {
      const recordId = typeof params.record_success === 'string' && params.record_success.trim().length > 0
        ? params.record_success.trim()
        : null;
      if (!recordId) {
        return reply.code(400).send({ ok: false, error: 'record_success is required' });
      }

      const record = await fetchRubitimeRecordById({ recordId });
      const result = await processRubitimeBody({
        body: {
          from: 'user',
          event: 'event-create-record',
          data: record,
        },
        correlationId,
        eventId,
        requestId: request.id,
        eventGateway: deps.eventGateway,
      });
      if (result?.status === 'rejected') {
        reqLogger.warn({ reason: result.reason }, 'rubitime record_success pipeline rejected');
        return reply.code(503).send({ ok: false, error: 'Processing failed' });
      }
      return reply.code(200).send({ ok: true, source: 'record_success', recordId });
    } catch (err) {
      reqLogger.error({ err }, 'rubitime record_success callback failed');
      return reply.code(500).send({ ok: false, error: 'Internal error' });
    }
  });
}
