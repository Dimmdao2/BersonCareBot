import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventGateway } from '../../kernel/contracts/index.js';
import { getCurrentOrganizationPrincipalId } from '../../infra/principal/organizationPrincipal.js';
import type { DedicatedBotInboundForwardDeps } from '../common/clinicBotInboundForward.js';
import { registerTelegramWebhookRoutes } from './webhook.js';

vi.mock('../../infra/operatorIncident/recordIntegrationWebhookOutcome.js', () => ({
  recordIntegrationWebhookOutcome: vi.fn(),
}));
vi.mock('./setupMenuButton.js', () => ({
  ensureNoMenuButtonForUser: vi.fn(async () => undefined),
  setupTelegramMenuButton: vi.fn(async () => undefined),
}));

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = 'a'.repeat(64);
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

describe('dedicated Telegram inbound ownership', () => {
  it('uses only the exact bot-instance organization and rejects an unknown instance before dispatch', async () => {
    const seenOrganizations: Array<string | null> = [];
    const handleIncomingEvent = vi.fn(async () => {
      seenOrganizations.push(getCurrentOrganizationPrincipalId() ?? null);
      return { status: 'accepted' as const };
    });
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerTelegramWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as unknown as EventGateway,
      setupProviderSurface: false,
      resolveOrganizationIdForMessengerIdentity: async () => '99999999-9999-4999-8999-999999999999',
      resolveDedicatedClinicBotOrganization: async (fingerprint) =>
        fingerprint === FINGERPRINT ? ORGANIZATION_ID : null,
    });

    const payload = {
      update_id: 1,
      message: {
        message_id: 1,
        text: 'help',
        from: { id: 42 },
        chat: { id: 42 },
      },
    };
    const [accepted, rejected] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/webhook/telegram/dedicated/${FINGERPRINT}`,
        payload,
      }),
      app.inject({
        method: 'POST',
        url: `/webhook/telegram/dedicated/${'b'.repeat(64)}`,
        payload,
      }),
    ]);

    expect(accepted.statusCode).toBe(200);
    expect(rejected.statusCode).toBe(200);
    expect(handleIncomingEvent).toHaveBeenCalledOnce();
    expect(seenOrganizations).toEqual([ORGANIZATION_ID]);
  });

  it('keeps the dedicated route without mounting the platform webhook in long-polling mode', async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerTelegramWebhookRoutes(app, {
      eventGateway: {
        handleIncomingEvent: vi.fn(async () => ({ status: 'accepted' as const })),
      } as unknown as EventGateway,
      setupProviderSurface: false,
      registerPlatformWebhook: false,
      resolveDedicatedClinicBotOrganization: async () => ORGANIZATION_ID,
    });

    const payload = {
      update_id: 1,
      message: {
        message_id: 1,
        text: 'help',
        from: { id: 42 },
        chat: { id: 42 },
      },
    };
    const [platform, dedicated] = await Promise.all([
      app.inject({ method: 'POST', url: '/webhook/telegram', payload }),
      app.inject({
        method: 'POST',
        url: `/webhook/telegram/dedicated/${FINGERPRINT}`,
        payload,
      }),
    ]);

    expect(platform.statusCode).toBe(404);
    expect(dedicated.statusCode).toBe(200);
  });

  it('returns non-2xx without dispatch when the dedicated binding resolver fails', async () => {
    const handleIncomingEvent = vi.fn(async () => ({ status: 'accepted' as const }));
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerTelegramWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as unknown as EventGateway,
      setupProviderSurface: false,
      resolveDedicatedClinicBotOrganization: async () => {
        throw new Error('binding DB unavailable');
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/webhook/telegram/dedicated/${FINGERPRINT}`,
      payload: {
        update_id: 1,
        message: { message_id: 1, text: 'help', from: { id: 42 }, chat: { id: 42 } },
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
    await registerTelegramWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as unknown as EventGateway,
      setupProviderSurface: false,
      resolveDedicatedClinicBotOrganization: async () => ORGANIZATION_ID,
      dedicatedBotInboundForward,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/webhook/telegram/dedicated/${FINGERPRINT}`,
      payload: {
        update_id: 91,
        message: { message_id: 19, text: 'help', from: { id: 42 }, chat: { id: 42 } },
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
      dedupKey: 'telegram:91',
    }));
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerTelegramWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as unknown as EventGateway,
      setupProviderSurface: false,
      resolveDedicatedClinicBotOrganization: async () => ORGANIZATION_ID,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/webhook/telegram/dedicated/${FINGERPRINT}`,
      payload: {
        update_id: 91,
        message: { message_id: 19, text: 'help', from: { id: 42 }, chat: { id: 42 } },
      },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(handleIncomingEvent).toHaveBeenCalledOnce();
  });
});

describe('platform Telegram webhook authentication', () => {
  it('rejects missing and mismatched secret headers with the established response', async () => {
    const handleIncomingEvent = vi.fn(async () => ({ status: 'accepted' as const }));
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerTelegramWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as unknown as EventGateway,
      setupProviderSurface: false,
      getRuntimeConfig: async () => ({
        enabled: true,
        mode: 'webhook',
        botToken: 'bot-token',
        webhookSecret: 'expected-secret',
        sendMenuOnButtonPress: false,
      }),
    });

    const payload = {
      update_id: 1,
      message: {
        message_id: 1,
        text: 'help',
        from: { id: 42 },
        chat: { id: 42 },
      },
    };
    const missing = await app.inject({ method: 'POST', url: '/webhook/telegram', payload });
    const mismatched = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
      payload,
    });

    expect(missing.statusCode).toBe(200);
    expect(missing.json()).toEqual({ ok: false, error: 'Forbidden' });
    expect(mismatched.statusCode).toBe(200);
    expect(mismatched.json()).toEqual({ ok: false, error: 'Forbidden' });
    expect(handleIncomingEvent).not.toHaveBeenCalled();
  });

  it('keeps a real null organization binding as normal absence and still dispatches', async () => {
    const handleIncomingEvent = vi.fn(async () => ({ status: 'accepted' as const }));
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerTelegramWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as unknown as EventGateway,
      setupProviderSurface: false,
      getRuntimeConfig: async () => ({
        enabled: true,
        mode: 'webhook',
        botToken: 'bot-token',
        webhookSecret: 'expected-secret',
        sendMenuOnButtonPress: false,
      }),
      resolveOrganizationIdForMessengerIdentity: async () => null,
      resolveMessengerStaffAdmin: async () => false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      headers: { 'x-telegram-bot-api-secret-token': 'expected-secret' },
      payload: {
        update_id: 1,
        message: {
          message_id: 1,
          text: 'help',
          from: { id: 42 },
          chat: { id: 42, type: 'private' },
        },
      },
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
      await registerTelegramWebhookRoutes(app, {
        eventGateway: { handleIncomingEvent } as unknown as EventGateway,
        setupProviderSurface: false,
        getRuntimeConfig: async () => ({
          enabled: true,
          mode: 'webhook',
          botToken: 'bot-token',
          webhookSecret: 'expected-secret',
          sendMenuOnButtonPress: false,
        }),
        resolveOrganizationIdForMessengerIdentity:
          resolver === 'organization' ? reject : async () => ORGANIZATION_ID,
        resolveMessengerStaffAdmin: resolver === 'admin' ? reject : async () => false,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/webhook/telegram',
        headers: { 'x-telegram-bot-api-secret-token': 'expected-secret' },
        payload: {
          update_id: 1,
          message: {
            message_id: 1,
            text: 'help',
            from: { id: 42 },
            chat: { id: 42, type: 'private' },
          },
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ ok: false, error: 'Internal error' });
      expect(handleIncomingEvent).not.toHaveBeenCalled();
    },
  );
});
