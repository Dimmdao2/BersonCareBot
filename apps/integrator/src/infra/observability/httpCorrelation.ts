import {
  BC_CORRELATION_ID_HEADER,
  resolveCorrelationId,
  runWithObservabilityContext,
  type CorrelationId,
} from '@bersoncare/db-principal';
import type { FastifyInstance } from 'fastify';
import type { IncomingMessage } from 'node:http';

export function resolveHttpCorrelationId(request: IncomingMessage): CorrelationId {
  const raw = request.headers[BC_CORRELATION_ID_HEADER];
  return resolveCorrelationId(Array.isArray(raw) ? undefined : raw);
}

/** Fastify lifecycle bridge into the existing principal ALS; owns no context storage. */
export function registerHttpCorrelationContext(app: FastifyInstance): void {
  app.addHook('onRequest', (request, _reply, done) => {
    runWithObservabilityContext({ correlationId: request.id }, done);
  });
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header(BC_CORRELATION_ID_HEADER, request.id);
    return payload;
  });
}
