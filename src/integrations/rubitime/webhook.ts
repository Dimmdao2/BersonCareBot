import type { FastifyInstance } from 'fastify';
import { getRequestLogger, newEventId } from '../../observability/logger.js';
import { orchestrateIncomingEvent } from '../../domain/usecases/index.js';
import type { InsertRubitimeEventInput, UpsertRubitimeRecordInput } from '../../db/repos/rubitimeRecords.js';
import type { DbWriteMutation, OutgoingEvent } from '../../domain/contracts/index.js';
import { rubitimeIncomingToEvent } from './connector.js';
import { parseRubitimeBody } from './schema.js';

export type RubitimeWebhookDeps = {
  insertEvent: (input: InsertRubitimeEventInput) => Promise<void>;
  upsertRecord: (input: UpsertRubitimeRecordInput) => Promise<void>;
  dispatchMessageByPhone: (input: {
    phoneNormalized: string;
    messageText: string;
    smsFallbackText: string;
    correlationId?: string;
  }) => Promise<void>;
  /** Токен для проверки во входящем path /webhook/rubitime/:token. */
  webhookToken: string;
};

function extractIncomingToken(params: unknown): string | null {
  if (!params || typeof params !== 'object') return null;
  const value = (params as Record<string, unknown>).token;
  return typeof value === 'string' ? value : null;
}

export function rubitimeWebhookRoutes(app: FastifyInstance, deps: RubitimeWebhookDeps): void {
  const { insertEvent, upsertRecord, dispatchMessageByPhone, webhookToken } = deps;

  const handler = async (request: {
    id: string;
    headers: Record<string, unknown>;
    query: unknown;
    params: unknown;
    body: unknown;
  }, reply: {
    code: (statusCode: number) => { send: (payload: unknown) => unknown };
  }) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });

    const incomingToken = extractIncomingToken(request.params);
    if (incomingToken !== webhookToken) {
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

    const incoming = rubitimeIncomingToEvent({
      body: parseResult.data,
      correlationId,
      eventId,
    });
    const result = orchestrateIncomingEvent(incoming);

    for (const mutation of result.writes) {
      await applyDbMutation(mutation, {
        insertEvent,
        upsertRecord,
        reqLogger,
      });
    }

    for (const outgoing of result.outgoing) {
      await dispatchOutgoingEvent(outgoing, dispatchMessageByPhone);
    }

    return reply.code(200).send({ ok: true });
  };

  app.post('/webhook/rubitime/:token', handler);
}

async function applyDbMutation(
  mutation: DbWriteMutation,
  deps: {
    insertEvent: (input: InsertRubitimeEventInput) => Promise<void>;
    upsertRecord: (input: UpsertRubitimeRecordInput) => Promise<void>;
    reqLogger: ReturnType<typeof getRequestLogger>;
  },
): Promise<void> {
  if (mutation.type === 'event.log') {
    await deps.insertEvent(mutation.params as InsertRubitimeEventInput);
    return;
  }
  if (mutation.type === 'booking.upsert') {
    const params = mutation.params as UpsertRubitimeRecordInput;
    if (!params.rubitimeRecordId) {
      deps.reqLogger.warn({ mutation }, 'rubitime payload has no data.id, upsert skipped');
      return;
    }
    await deps.upsertRecord(params);
  }
}

async function dispatchOutgoingEvent(
  outgoing: OutgoingEvent,
  dispatchMessageByPhone: RubitimeWebhookDeps['dispatchMessageByPhone'],
): Promise<void> {
  if (outgoing.type !== 'message.send' || outgoing.meta.source !== 'rubitime') return;
  const payload = outgoing.payload as {
    recipient?: { phoneNormalized?: string };
    message?: { text?: string };
    fallback?: { smsText?: string };
  };

  await dispatchMessageByPhone({
    phoneNormalized: payload.recipient?.phoneNormalized ?? '',
    messageText: payload.message?.text ?? '',
    smsFallbackText: payload.fallback?.smsText ?? '',
    ...(outgoing.meta.correlationId ? { correlationId: outgoing.meta.correlationId } : {}),
  });
}
