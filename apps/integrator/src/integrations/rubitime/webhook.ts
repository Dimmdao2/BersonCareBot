import type { FastifyInstance } from 'fastify';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import type {
  DispatchPort,
  EventGateway,
  GatewayResult,
  WebappEventsPort,
} from '../../kernel/contracts/index.js';
import { createDbPort } from '../../infra/db/client.js';
import { createGetBranchTimezoneWithDataQuality } from '../../infra/db/branchTimezone.js';
import { fetchRubitimeRecordById } from './client.js';
import {
  buildUserEmailAutobindWebappEvent,
  rubitimeIncomingToEvent,
  syncRubitimeWebhookBodyToGoogleCalendar,
} from './connector.js';
import { prepareRubitimeWebhookIngress } from './ingestNormalization.js';
import { getRubitimeWebhookToken } from './runtimeConfig.js';
import { parseRubitimeBody } from './schema.js';

/** Dependencies for Rubitime webhook handler registration. */
export type RubitimeWebhookDeps = {
  eventGateway: EventGateway;
  webappEventsPort: WebappEventsPort;
  dispatchPort: DispatchPort;
};

async function processRubitimeBody(input: {
  body: { from: string; event: 'event-create-record' | 'event-update-record' | 'event-remove-record' | 'event-delete-record'; data: Record<string, unknown> };
  correlationId: string;
  eventId: string;
  requestId: string;
  eventGateway: EventGateway;
  webappEventsPort: WebappEventsPort;
  dispatchPort: DispatchPort;
}): Promise<GatewayResult> {
  const reqLogger = getRequestLogger(input.requestId, {
    correlationId: input.correlationId,
    eventId: input.eventId,
  });
  reqLogger.info(
    { event: input.body.event, from: input.body.from, dataKeys: Object.keys(input.body.data ?? {}) },
    '[rubitime] webhook received',
  );

  const dbPort = createDbPort();
  const incoming = await prepareRubitimeWebhookIngress(input.body, {
    db: dbPort,
    dispatchPort: input.dispatchPort,
    getBranchTimezone: createGetBranchTimezoneWithDataQuality({
      db: dbPort,
      dispatchPort: input.dispatchPort,
    }),
  });

  let gcalEventId: string | null = null;
  try {
    gcalEventId = await syncRubitimeWebhookBodyToGoogleCalendar(incoming, {
      db: dbPort,
      dispatchPort: input.dispatchPort,
    });
  } catch (err) {
    reqLogger.warn({ err }, '[rubitime] google calendar sync failed');
  }

  const incomingEvent = rubitimeIncomingToEvent({
    body: input.body,
    incoming,
    correlationId: input.correlationId,
    eventId: input.eventId,
    gcalEventId,
  });

  const loggedIncoming = (incomingEvent.payload as { incoming?: unknown }).incoming;
  reqLogger.info(
    {
      action: (loggedIncoming as Record<string, unknown>)?.action,
      entity: (loggedIncoming as Record<string, unknown>)?.entity,
      status: (loggedIncoming as Record<string, unknown>)?.status,
      phone: (loggedIncoming as Record<string, unknown>)?.phone,
      recordId: (loggedIncoming as Record<string, unknown>)?.recordId,
      gcalEventId: (loggedIncoming as Record<string, unknown>)?.gcalEventId,
    },
    '[rubitime] mapped to event',
  );

  const autobind = buildUserEmailAutobindWebappEvent(input.body);
  if (autobind) {
    try {
      const emitResult = await input.webappEventsPort.emit(autobind);
      if (!emitResult.ok) {
        reqLogger.warn(
          { status: emitResult.status, error: emitResult.error },
          '[rubitime] user.email.autobind emit failed',
        );
      }
    } catch (err) {
      reqLogger.warn({ err }, '[rubitime] user.email.autobind emit threw');
    }
  }

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
      const webhookToken = await getRubitimeWebhookToken();
      if (params.token !== webhookToken) {
        reqLogger.warn('rubitime webhook token mismatch');
        return reply.code(200).send({ ok: false, error: 'Forbidden' });
      }

      const parseResult = parseRubitimeBody(request.body);
      if (!parseResult.success) {
        reqLogger.warn(
          { err: parseResult.error.flatten(), hasBody: request.body != null },
          'rubitime webhook body validation failed',
        );
        return reply.code(200).send({ ok: false, error: 'Invalid webhook body' });
      }

      const result = await processRubitimeBody({
        body: parseResult.data,
        correlationId,
        eventId,
        requestId: request.id,
        eventGateway: deps.eventGateway,
        webappEventsPort: deps.webappEventsPort,
        dispatchPort: deps.dispatchPort,
      });
      if (result?.status === 'rejected') {
        reqLogger.warn({ reason: result.reason }, 'rubitime webhook pipeline rejected');
        return reply.code(200).send({ ok: false, error: 'Processing failed' });
      }
      return reply.code(200).send({ ok: true });
    } catch (err) {
      reqLogger.error({ err }, 'rubitime webhook failed');
      return reply.code(200).send({ ok: false, error: 'Internal error' });
    }
  });

  app.get('/api/rubitime', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    const params = request.query as { record_success?: string; token?: string };
    const webhookToken = await getRubitimeWebhookToken();
    if (params.token !== webhookToken) {
      reqLogger.warn('rubitime record_success token mismatch');
      return reply.code(200).send({ ok: false, error: 'Missing or invalid token' });
    }

    try {
      const recordId = typeof params.record_success === 'string' && params.record_success.trim().length > 0
        ? params.record_success.trim()
        : null;
      if (!recordId) {
        return reply.code(200).send({ ok: false, error: 'record_success is required' });
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
        webappEventsPort: deps.webappEventsPort,
        dispatchPort: deps.dispatchPort,
      });
      if (result?.status === 'rejected') {
        reqLogger.warn({ reason: result.reason }, 'rubitime record_success pipeline rejected');
        return reply.code(200).send({ ok: false, error: 'Processing failed' });
      }
      return reply.code(200).send({ ok: true, source: 'record_success', recordId });
    } catch (err) {
      reqLogger.error({ err }, 'rubitime record_success callback failed');
      return reply.code(200).send({ ok: false, error: 'Internal error' });
    }
  });
}
