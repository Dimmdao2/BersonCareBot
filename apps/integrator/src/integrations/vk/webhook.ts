import type { FastifyInstance } from 'fastify';
import { getRequestLogger, newEventId } from '../../infra/observability/logger.js';
import { getVkRuntimeConfig } from '../../infra/adapters/integrationRuntimeConfig.js';
import { isWebhookSecretValid } from '../common/webhookSecretCompare.js';
import type { EventGateway } from '../../kernel/contracts/index.js';
import { runWithBootstrapPrincipal, runWithIntegratorPrincipal, runWithOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';
import { vkIncomingToEvent } from './connector.js';
import { fromVk } from './mapIn.js';
import { parseVkCallback } from './schema.js';

export type VkWebhookDeps = {
  eventGateway: EventGateway;
  getRuntimeConfig?: typeof getVkRuntimeConfig;
  resolveOrganizationIdForMessengerIdentity?: (externalId: string, resource: 'vk') => Promise<string | null>;
  resolveIntegratorUserIdForMessenger?: (externalId: string, resource: 'vk') => Promise<string | undefined>;
};

function externalId(callback: Parameters<typeof fromVk>[0]): string | null {
  const object = callback.object;
  if (!object) return null;
  if ('from_id' in object) return String(object.from_id);
  if ('user_id' in object) return String(object.user_id);
  return null;
}

/** VK Callback API endpoint. Confirmation and every accepted event deliberately return plain text. */
export async function registerVkWebhookRoutes(app: FastifyInstance, deps: VkWebhookDeps): Promise<void> {
  app.post('/webhook/vk', async (request, reply) => {
    const correlationId = request.id;
    const eventId = newEventId('incoming');
    const reqLogger = getRequestLogger(request.id, { correlationId, eventId });
    const parsed = parseVkCallback(request.body);
    if (!parsed.success) return reply.code(400).type('text/plain').send('invalid');
    const config = await (deps.getRuntimeConfig ?? getVkRuntimeConfig)();
    if (!config.enabled) return reply.code(503).type('text/plain').send('unavailable');
    if (!isWebhookSecretValid(parsed.data.secret, config.callbackSecret)) {
      reqLogger.warn({ source: 'vk' }, 'vk callback secret rejected');
      return reply.code(403).type('text/plain').send('forbidden');
    }
    if (parsed.data.type === 'confirmation') return reply.code(200).type('text/plain').send(config.confirmationToken);
    const incoming = fromVk(parsed.data);
    if (!incoming) return reply.code(200).type('text/plain').send('ok');
    try {
      const id = externalId(parsed.data);
      const preRouting = await runWithBootstrapPrincipal({ source: 'vk-webhook:pre-routing' }, async () => ({
        organizationId: id ? await deps.resolveOrganizationIdForMessengerIdentity?.(id, 'vk') ?? null : null,
        integratorUserId: id ? await deps.resolveIntegratorUserIdForMessenger?.(id, 'vk') ?? null : null,
      }));
      const event = vkIncomingToEvent({
        incoming,
        correlationId,
        eventId,
        ...(parsed.data.event_id ? { providerEventId: parsed.data.event_id } : {}),
      });
      const invoke = () => deps.eventGateway.handleIncomingEvent(event);
      const result = preRouting.organizationId && preRouting.integratorUserId
        ? await runWithIntegratorPrincipal({ organizationId: preRouting.organizationId, integratorUserId: preRouting.integratorUserId, source: 'vk-webhook' }, invoke)
        : preRouting.organizationId
          ? await runWithOrganizationPrincipal(preRouting.organizationId, invoke)
          : await runWithBootstrapPrincipal({ source: 'vk-webhook:unresolved-org' }, invoke);
      if (result.status === 'rejected') {
        reqLogger.warn({ reason: result.reason }, 'vk webhook pipeline rejected');
        return reply.code(500).type('text/plain').send('failed');
      }
      return reply.code(200).type('text/plain').send('ok');
    } catch (error) {
      reqLogger.error({ error }, 'vk webhook failed');
      return reply.code(500).type('text/plain').send('failed');
    }
  });
}
