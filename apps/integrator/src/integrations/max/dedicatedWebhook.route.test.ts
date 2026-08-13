import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventGateway } from '../../kernel/contracts/index.js';
import { getCurrentOrganizationPrincipalId } from '../../infra/principal/organizationPrincipal.js';
import { registerMaxWebhookRoutes } from './webhook.js';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const FINGERPRINT = 'c'.repeat(64);
const apps: Array<Awaited<ReturnType<typeof Fastify>>> = [];

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
      resolveOrganizationIdForMessengerIdentity: async () =>
        '99999999-9999-4999-8999-999999999999',
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
});
