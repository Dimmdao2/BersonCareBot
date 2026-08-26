/**
 * Audit artifact (TPB-15, круг 2). Независимый kill-set к требованию TPB-08:
 * «Branding влияет только на patient-facing surface; staff/admin видят Therapysto.»
 *
 * Проверяется ПОВЕДЕНИЕ пяти мест, где раньше стоял общий бренд-fallback:
 * relay-outbound (email/web_push), operator-alert-relay (email/web_push) и общий
 * web-push delivery adapter. Требование: без имени поверхности вызов ОТКАЗЫВАЕТ и
 * НЕ доставляет; с именем — имя доходит дословно, без подстановки бренда.
 */
import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DispatchPort,
  IdempotencyPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import { registerBersoncareRelayOutboundRoute } from './relayOutboundRoute.js';
import { registerOperatorAlertRelayRoute } from './operatorAlertRelayRoute.js';
import { createWebPushDeliveryAdapter } from '../web-push/deliveryAdapter.js';
import { runWithOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';

const SECRET = 'audit-tpb15-secret';
const ORG = '0c3c1bb2-b42f-44b7-8398-1dc766abec2d';
const PUSH_USER = '3c91f0cf-ff9a-48f3-88e6-6bd773056fd3';
const apps: FastifyInstance[] = [];

function idempotency(): IdempotencyPort {
  const seen = new Set<string>();
  return {
    tryAcquire: async (k: string) => (seen.has(k) ? false : (seen.add(k), true)),
    release: async (k: string) => void seen.delete(k),
  };
}

function headers(rawBody: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': createHmac('sha256', SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('base64url'),
  };
}

async function relayApp(dispatchOutgoing: DispatchPort['dispatchOutgoing']) {
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerBersoncareRelayOutboundRoute(app, {
    dispatchPort: { dispatchOutgoing },
    sharedSecret: SECRET,
    idempotencyPort: idempotency(),
  });
  return app;
}

async function operatorApp(dispatchOutgoing: DispatchPort['dispatchOutgoing']) {
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerOperatorAlertRelayRoute(app, {
    dispatchPort: { dispatchOutgoing },
    sharedSecret: SECRET,
    isSmsProviderReady: async () => true,
    idempotencyPort: idempotency(),
  });
  return app;
}

function post(app: FastifyInstance, url: string, body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  return app.inject({ method: 'POST', url, headers: headers(raw), payload: raw });
}

const RELAY = '/api/bersoncare/relay-outbound';
const OPERATOR = '/api/bersoncare/operator-alert-relay';

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('TPB-15 kill-set: имя поверхности задаёт вызывающий, доставка fail-closed', () => {
  it('K1 relay email без subject не доставляет', async () => {
    const dispatch = vi.fn(async (_i: OutgoingIntent) => ({}));
    const res = await post(await relayApp(dispatch), RELAY, {
      messageId: 'k1',
      channel: 'email',
      recipient: 'patient@example.test',
      text: 'body',
      idempotencyKey: 'k1',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('K2 relay email с пробельным subject не доставляет', async () => {
    const dispatch = vi.fn(async (_i: OutgoingIntent) => ({}));
    const res = await post(await relayApp(dispatch), RELAY, {
      messageId: 'k2',
      channel: 'email',
      recipient: 'patient@example.test',
      text: 'body',
      idempotencyKey: 'k2',
      metadata: { subject: '   ' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('K3 relay web_push без title не доставляет', async () => {
    const dispatch = vi.fn(async (_i: OutgoingIntent) => ({}));
    const res = await post(await relayApp(dispatch), RELAY, {
      messageId: 'k3',
      organizationId: ORG,
      channel: 'web_push',
      recipient: PUSH_USER,
      text: 'body',
      idempotencyKey: 'k3',
      metadata: { url: '/app/patient' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('K4 operator-alert email без subject не доставляет', async () => {
    const dispatch = vi.fn(async (_i: OutgoingIntent) => ({}));
    const res = await post(await operatorApp(dispatch), OPERATOR, {
      messageId: 'k4',
      channel: 'email',
      recipient: 'ops@example.test',
      text: 'alert',
      idempotencyKey: 'k4',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('K5 operator-alert web_push с пустым title не доставляет', async () => {
    const dispatch = vi.fn(async (_i: OutgoingIntent) => ({}));
    const res = await post(await operatorApp(dispatch), OPERATOR, {
      messageId: 'k5',
      organizationId: ORG,
      channel: 'web_push',
      recipient: PUSH_USER,
      text: 'alert',
      idempotencyKey: 'k5',
      metadata: { title: '' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('K6 общий web-push adapter отказывает без title и не читает подписки', async () => {
    const getSubscriptionsForUser = vi.fn(async () => []);
    const adapter = createWebPushDeliveryAdapter({
      webPushAccessPort: {
        getSubscriptionsForUser,
        getVapidCredentials: vi.fn(async () => null),
        deleteSubscriptionByEndpoint: vi.fn(async () => false),
      } as never,
    });
    await expect(
      runWithOrganizationPrincipal(ORG, () =>
        adapter.send({
          type: 'message.send',
          meta: { eventId: 'k6', occurredAt: new Date().toISOString(), source: 'audit' },
          payload: {
            recipient: { pushUserId: PUSH_USER },
            message: { text: 'body' },
            delivery: { channels: ['web_push'] },
          },
        } as never),
      ),
    ).rejects.toThrow(/WEB_PUSH_PAYLOAD_INVALID/);
    expect(getSubscriptionsForUser).not.toHaveBeenCalled();
  });

  it('K7 общий web-push adapter отказывает при пробельном title', async () => {
    const adapter = createWebPushDeliveryAdapter({
      webPushAccessPort: {
        getSubscriptionsForUser: vi.fn(async () => []),
        getVapidCredentials: vi.fn(async () => null),
        deleteSubscriptionByEndpoint: vi.fn(async () => false),
      } as never,
    });
    await expect(
      runWithOrganizationPrincipal(ORG, () =>
        adapter.send({
          type: 'message.send',
          meta: { eventId: 'k7', occurredAt: new Date().toISOString(), source: 'audit' },
          payload: {
            recipient: { pushUserId: PUSH_USER },
            message: { text: 'body' },
            title: '  ',
            delivery: { channels: ['web_push'] },
          },
        } as never),
      ),
    ).rejects.toThrow(/WEB_PUSH_PAYLOAD_INVALID/);
  });

  it('K8 пациентское имя доходит дословно, бренд не подставляется', async () => {
    const dispatch = vi.fn(async (_i: OutgoingIntent) => ({}));
    const app = await relayApp(dispatch);
    const email = await post(app, RELAY, {
      messageId: 'k8-email',
      channel: 'email',
      recipient: 'patient@example.test',
      text: 'body',
      idempotencyKey: 'k8-email',
      metadata: { subject: 'Клиника «Ромашка»' },
    });
    expect(email.statusCode).toBe(200);
    expect((dispatch.mock.calls[0]?.[0].payload as { subject?: string }).subject).toBe(
      'Клиника «Ромашка»',
    );

    const push = await post(app, RELAY, {
      messageId: 'k8-push',
      organizationId: ORG,
      channel: 'web_push',
      recipient: PUSH_USER,
      text: 'body',
      idempotencyKey: 'k8-push',
      metadata: { title: 'Therapygo' },
    });
    expect(push.statusCode).toBe(200);
    expect((dispatch.mock.calls[1]?.[0].payload as { title?: string }).title).toBe('Therapygo');
  });

  it('K9 штабное имя доходит дословно через operator-alert', async () => {
    const dispatch = vi.fn(async (_i: OutgoingIntent) => ({}));
    const app = await operatorApp(dispatch);
    const res = await post(app, OPERATOR, {
      messageId: 'k9',
      channel: 'email',
      recipient: 'ops@example.test',
      text: 'alert',
      idempotencyKey: 'k9',
      metadata: { subject: '[TEST] Therapysto — сбой доставки' },
    });
    expect(res.statusCode).toBe(200);
    expect((dispatch.mock.calls[0]?.[0].payload as { subject?: string }).subject).toBe(
      '[TEST] Therapysto — сбой доставки',
    );
  });
});
