import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventGateway } from '../../kernel/contracts/index.js';
import { getCurrentOrganizationPrincipalId } from '../../infra/principal/organizationPrincipal.js';
import { registerTelegramWebhookRoutes } from './webhook.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = 'a'.repeat(64);
const apps: Array<Awaited<ReturnType<typeof Fastify>>> = [];

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
      resolveOrganizationIdForMessengerIdentity: async () =>
        '99999999-9999-4999-8999-999999999999',
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
});
