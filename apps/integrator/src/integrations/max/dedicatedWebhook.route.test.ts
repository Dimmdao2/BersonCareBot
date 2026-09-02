import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventGateway } from '../../kernel/contracts/index.js';
import { getCurrentOrganizationPrincipalId } from '../../infra/principal/organizationPrincipal.js';
import type { DedicatedBotInboundForwardDeps } from '../common/clinicBotInboundForward.js';
import { registerMaxWebhookRoutes } from './webhook.js';

vi.mock('../../infra/db/client.js', () => ({ createDbPort: vi.fn(() => ({})) }));
vi.mock('../../infra/db/repos/operationalVerboseLog.js', () => ({
  getOperationalVerboseLogEnabled: vi.fn(async () => false),
}));
vi.mock('../../infra/operatorIncident/recordIntegrationWebhookOutcome.js', () => ({
  recordIntegrationWebhookOutcome: vi.fn(),
}));

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const FINGERPRINT = 'c'.repeat(64);
const apps: Array<Awaited<ReturnType<typeof Fastify>>> = [];

function failingForwarding(): DedicatedBotInboundForwardDeps & { acquired: Set<string> } {
  const acquired = new Set<string>();
  return {
    acquired,
    dispatchPort: {
      async dispatchOutgoing() {
        throw new Error('clinic delivery unavailable');
      },
    },
    async resolveInboundForwarding() {
      return { enabled: true, destinationChatId: '123456' };
    },
    idempotencyPort: {
      async tryAcquire(key) {
        acquired.add(key);
        return true;
      },
      async release(key) {
        acquired.delete(key);
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('dedicated MAX inbound ownership', () => {
  it('routes a known bot instance to its exact organization and drops an unknown one', async () => {
    const seenOrganizations: Array<string | null> = [];
    const handleIncomingEvent = vi.fn(async () => {
      seenOrganizations.push(getCurrentOrganizationPrincipalId() ?? null);
      return { status: 'accepted' as const };
    });
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerMaxWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as unknown as EventGateway,
      setupProviderSurface: false,
      resolveOrganizationIdForMessengerIdentity: async () => '99999999-9999-4999-8999-999999999999',
      resolveDedicatedClinicBotOrganization: async (fingerprint) =>
        fingerprint === FINGERPRINT ? ORGANIZATION_ID : null,
    });

    const payload = {
      update_type: 'message_created',
      timestamp: 1,
      message: {
        recipient: { chat_id: 42 },
        sender: { user_id: 42 },
        body: { mid: 'message-1', text: 'help' },
      },
    };
    const [accepted, rejected] = await Promise.all([
      app.inject({ method: 'POST', url: `/webhook/max/dedicated/${FINGERPRINT}`, payload }),
      app.inject({ method: 'POST', url: `/webhook/max/dedicated/${'d'.repeat(64)}`, payload }),
    ]);

    expect(accepted.statusCode).toBe(200);
    expect(rejected.statusCode).toBe(200);
    expect(handleIncomingEvent).toHaveBeenCalledOnce();
    expect(seenOrganizations).toEqual([ORGANIZATION_ID]);
  });

  it('returns non-2xx without dispatch when the dedicated binding resolver fails', async () => {
    const handleIncomingEvent = vi.fn(async () => ({ status: 'accepted' as const }));
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerMaxWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as unknown as EventGateway,
      setupProviderSurface: false,
      resolveDedicatedClinicBotOrganization: async () => {
        throw new Error('binding DB unavailable');
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/webhook/max/dedicated/${FINGERPRINT}`,
      payload: {
        update_type: 'message_created',
        timestamp: 1,
        message: {
          recipient: { chat_id: 42 },
          sender: { user_id: 42 },
          body: { mid: 'message-1', text: 'help' },
        },
      },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(handleIncomingEvent).not.toHaveBeenCalled();
  });

  it('returns retryable non-2xx and releases dedup when clinic forwarding fails', async () => {
    const handleIncomingEvent = vi.fn(async () => ({ status: 'accepted' as const }));
    const dedicatedBotInboundForward = failingForwarding();
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerMaxWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as unknown as EventGateway,
      setupProviderSurface: false,
      resolveDedicatedClinicBotOrganization: async () => ORGANIZATION_ID,
      resolveDedicatedClinicBotApiKey: async () => 'clinic-key',
      dedicatedBotInboundForward,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/webhook/max/dedicated/${FINGERPRINT}`,
      payload: {
        update_type: 'message_created',
        timestamp: 1,
        message: {
          recipient: { chat_id: 42 },
          sender: { user_id: 42 },
          body: { mid: 'message-19', text: 'help' },
        },
      },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(handleIncomingEvent).not.toHaveBeenCalled();
    expect(dedicatedBotInboundForward.acquired.size).toBe(0);
  });

  it('returns retryable non-2xx when the dedicated event pipeline rejects the update', async () => {
    const handleIncomingEvent = vi.fn(async () => ({
      status: 'rejected' as const,
      reason: 'idempotency unavailable',
      dedupKey: 'max:message-19',
    }));
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerMaxWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as unknown as EventGateway,
      setupProviderSurface: false,
      resolveDedicatedClinicBotOrganization: async () => ORGANIZATION_ID,
      resolveDedicatedClinicBotApiKey: async () => 'clinic-key',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/webhook/max/dedicated/${FINGERPRINT}`,
      payload: {
        update_type: 'message_created',
        timestamp: 1,
        message: {
          recipient: { chat_id: 42 },
          sender: { user_id: 42 },
          body: { mid: 'message-19', text: 'help' },
        },
      },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(handleIncomingEvent).toHaveBeenCalledOnce();
  });
});

describe('platform MAX resolver failures', () => {
  const payload = {
    update_type: 'message_created' as const,
    timestamp: 1,
    message: {
      recipient: { chat_id: 42 },
      sender: { user_id: 42 },
      body: { mid: 'message-1', text: 'help' },
    },
  };

  it('keeps a real null organization binding as normal absence and still dispatches', async () => {
    const handleIncomingEvent = vi.fn(async () => ({ status: 'accepted' as const }));
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerMaxWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as unknown as EventGateway,
      setupProviderSurface: false,
      getRuntimeConfig: async () => ({
        enabled: true,
        apiKey: 'api-key',
        webhookSecret: 'expected-secret',
        baseUrl: 'https://max.test',
      }),
      resolveOrganizationIdForMessengerIdentity: async () => null,
      resolveMessengerStaffAdmin: async () => false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/max',
      headers: { 'x-max-bot-api-secret': 'expected-secret' },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(handleIncomingEvent).toHaveBeenCalledOnce();
  });

  it.each(['organization', 'admin'] as const)(
    'returns retryable non-2xx without dispatch when the %s resolver rejects',
    async (resolver) => {
      const handleIncomingEvent = vi.fn(async () => ({ status: 'accepted' as const }));
      const reject = async (): Promise<never> => {
        throw new Error(`${resolver} resolver unavailable`);
      };
      const app = Fastify({ logger: false });
      apps.push(app);
      await registerMaxWebhookRoutes(app, {
        eventGateway: { handleIncomingEvent } as unknown as EventGateway,
        setupProviderSurface: false,
        getRuntimeConfig: async () => ({
          enabled: true,
          apiKey: 'api-key',
          webhookSecret: 'expected-secret',
          baseUrl: 'https://max.test',
        }),
        resolveOrganizationIdForMessengerIdentity:
          resolver === 'organization' ? reject : async () => ORGANIZATION_ID,
        resolveMessengerStaffAdmin: resolver === 'admin' ? reject : async () => false,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/webhook/max',
        headers: { 'x-max-bot-api-secret': 'expected-secret' },
        payload,
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ ok: false, error: 'Internal error' });
      expect(handleIncomingEvent).not.toHaveBeenCalled();
    },
  );
});
