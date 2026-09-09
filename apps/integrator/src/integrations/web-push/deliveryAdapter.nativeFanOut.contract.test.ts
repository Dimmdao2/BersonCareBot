/**
 * Auditor-live acceptance tests (#915, M6 Push backend, blind kill-set
 * `.lead/runs/mobile-push-backend-audit-20260909/00-blind-killset.md`).
 *
 * Contract under test: `createWebPushDeliveryAdapter().send()` fans a single logical
 * `web_push` channel out to browser (Web Push) and native (RuStore Universal Push)
 * transports (M6-05, M6-06, M6-11). Oracle is `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`
 * M6-05/M6-06/M6-07/M6-11 plus `OWNER_PRODUCT_RULES.md` §21/§22 (a notification is scoped to one
 * type/recipient/surface, never broadcast beyond it). Fakes stand in for the M2M
 * `WebPushAccessPort` boundary and the RuStore HTTP provider; nothing here re-implements the
 * production cipher or signing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebPushAccessPort } from '../../kernel/contracts/index.js';
import { createWebPushDeliveryAdapter } from './deliveryAdapter.js';
import { runWithOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';

const ORG = '0c3c1bb2-b42f-44b7-8398-1dc766abec2d';
const PUSH_USER = '3c91f0cf-ff9a-48f3-88e6-6bd773056fd3';

function basePort(overrides: Partial<WebPushAccessPort> = {}): WebPushAccessPort {
  return {
    getSubscriptionsForUser: vi.fn(async () => []),
    getVapidCredentials: vi.fn(async () => ({
      publicKey: 'public-key',
      privateKey: 'private-key',
      subject: 'mailto:ops@example.test',
    })),
    deleteSubscriptionByEndpoint: vi.fn(async () => false),
    getNativeTargetsForUser: vi.fn(async () => []),
    getRuStoreConfig: vi.fn(async () => ({
      endpoint: 'https://rustore.example.test/send',
      projectId: 'proj-1',
      authToken: 'token-1',
    })),
    deactivateNativeTarget: vi.fn(async () => true),
    ...overrides,
  } as WebPushAccessPort;
}

function intent(extraPushExtras: Record<string, unknown> = {}) {
  return {
    type: 'message.send' as const,
    meta: { eventId: 'evt-1', occurredAt: new Date().toISOString(), source: 'audit' },
    payload: {
      recipient: { pushUserId: PUSH_USER },
      message: { text: 'body' },
      title: 'Напоминание',
      url: '/app/patient',
      delivery: { channels: ['web_push'] },
      pushExtras: extraPushExtras,
    },
  } as never;
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('native web_push composite fan-out — kill-set §6/§7/§10', () => {
  it(
    'M6-05/M6-02: a notification produced without a typed pushSurface must not reach a native ' +
      'target belonging to a different app than the one being addressed — ' +
      'fault: no producer in this repo sets `pushExtras.pushSurface` (see report), so the fallback ' +
      "path is what every current caller actually exercises. It currently fans out to a user's " +
      'targets across BOTH apps, which crosses the Therapy Go / Therapysto identity boundary.',
    async () => {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as never;
      const sentTo: string[] = [];
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_url, init) => {
        const body = JSON.parse(String((init as { body?: unknown } | undefined)?.body));
        sentTo.push(body.message.data.pushSurface);
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const port = basePort({
        getNativeTargetsForUser: vi.fn(async () => [
          { id: 'target-therapygo', appId: 'therapygo', provider: 'rustore', token: 'tok-go' },
          { id: 'target-therapysto', appId: 'therapysto', provider: 'rustore', token: 'tok-sto' },
        ]),
      });
      const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: port });

      // Intent produced by a Therapy Go (patient) notification path — no pushSurface set,
      // matching every real caller in this repo today (rg -n "pushSurface" finds zero producers).
      const result = await runWithOrganizationPrincipal(ORG, () => adapter.send(intent()));

      expect(sentTo.sort()).toEqual(['therapygo']); // required: only the addressed surface
      expect((result.webPushOutcome as { transports?: { native: { delivered: number } } }).transports?.native.delivered).toBe(1);
    },
  );

  it('M6-11/§7: official invalid-auth provider error never deactivates the target', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      status: 'PROVIDER_ERROR',
      code: 400,
      errors: ['rustore: invalid auth token'],
    }), { status: 400 })) as never;
    const deactivateNativeTarget = vi.fn(async () => true);
    const port = basePort({
      getNativeTargetsForUser: vi.fn(async () => [
        { id: 'target-1', appId: 'therapygo', provider: 'rustore', token: 'tok-1' },
      ]),
      deactivateNativeTarget,
    });
    const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: port });

    const result = await runWithOrganizationPrincipal(ORG, () =>
      adapter.send(intent({ pushSurface: 'therapygo' })),
    );

    expect(deactivateNativeTarget).not.toHaveBeenCalled();
    expect((result.webPushOutcome as { transports: { native: { errors: number } } }).transports.native.errors).toBe(1);
  });

  it('M6-03/M6-11: official invalid-token provider response deactivates only that target, idempotently', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        status: 'PROVIDER_ERROR',
        code: 400,
        errors: ['rustore: invalid tokens tok-1'],
      }), { status: 400 }),
    ) as never;
    const deactivateNativeTarget = vi.fn(async () => true);
    const port = basePort({
      getNativeTargetsForUser: vi.fn(async () => [
        { id: 'target-1', appId: 'therapygo', provider: 'rustore', token: 'tok-1' },
      ]),
      deactivateNativeTarget,
    });
    const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: port });

    await runWithOrganizationPrincipal(ORG, () => adapter.send(intent({ pushSurface: 'therapygo' })));
    await runWithOrganizationPrincipal(ORG, () => adapter.send(intent({ pushSurface: 'therapygo' })));

    expect(deactivateNativeTarget).toHaveBeenCalledTimes(2);
    expect(deactivateNativeTarget).toHaveBeenCalledWith('target-1', ORG);
  });

  it('M6-07/M6-11: browser subscriptions and native targets both empty yields typed no_active_target, no provider call', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as never;
    const port = basePort();
    const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: port });

    const result = await runWithOrganizationPrincipal(ORG, () => adapter.send(intent()));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.webPushOutcome).toMatchObject({ status: 'skipped', reason: 'no_active_target' });
  });

  it('M6-06/M6-07: missing VAPID does not block a configured native transport (composite success)', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as never;
    const port = basePort({
      getVapidCredentials: vi.fn(async () => {
        throw new Error('vapid_unconfigured');
      }),
      getNativeTargetsForUser: vi.fn(async () => [
        { id: 'target-1', appId: 'therapygo', provider: 'rustore', token: 'tok-1' },
      ]),
    });
    const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: port });

    const result = await runWithOrganizationPrincipal(ORG, () =>
      adapter.send(intent({ pushSurface: 'therapygo' })),
    );

    expect(result.webPushOutcome).toMatchObject({ status: 'success' });
  });
});
