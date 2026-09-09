/**
 * Final #915 auditor-live oracle for the corrected native route/surface seam.
 *
 * Failure caught: a legacy queue row can make the native provider dispatch a route that is not a
 * canonical relative cabinet route, crossing the Therapy Go/Therapysto surface boundary or
 * handing a traversal-shaped path to the native tap router.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebPushAccessPort } from '../../kernel/contracts/index.js';
import { runWithOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';
import { createWebPushDeliveryAdapter } from './deliveryAdapter.js';

const ORG = '0c3c1bb2-b42f-44b7-8398-1dc766abec2d';
const PUSH_USER = '3c91f0cf-ff9a-48f3-88e6-6bd773056fd3';
const originalFetch = globalThis.fetch;

function nativeOnlyPort(): WebPushAccessPort {
  return {
    getSubscriptionsForUser: vi.fn(async () => []),
    getVapidCredentials: vi.fn(async () => ({
      publicKey: 'public-key',
      privateKey: 'private-key',
      subject: 'mailto:ops@example.test',
    })),
    deleteSubscriptionByEndpoint: vi.fn(async () => false),
    getNativeTargetsForUser: vi.fn(async () => [
      { id: 'target-therapygo', appId: 'therapygo', provider: 'rustore', token: 'tok-go' },
    ]),
    getRuStoreConfig: vi.fn(async () => ({
      endpoint: 'https://rustore.example.test/send',
      projectId: 'proj-1',
      authToken: 'token-1',
    })),
    deactivateNativeTarget: vi.fn(async () => true),
  } as WebPushAccessPort;
}

function intent(input: { url: string; pushExtras?: unknown }) {
  return {
    type: 'message.send' as const,
    meta: { eventId: 'evt-final-surface', occurredAt: new Date().toISOString(), source: 'audit' },
    payload: {
      recipient: { pushUserId: PUSH_USER },
      message: { text: 'body' },
      title: 'Напоминание',
      url: input.url,
      delivery: { channels: ['web_push'] },
      ...(input.pushExtras === undefined ? {} : { pushExtras: input.pushExtras }),
    },
  } as never;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('final native surface resolver — M6-05/M6-09', () => {
  it.each([
    ['a present invalid explicit surface', '/app/patient', { pushSurface: 'not-an-app' }],
    ['an absolute URL', 'https://therapygo.example.test/app/patient'],
    ['a protocol-relative URL', '//therapygo.example.test/app/patient'],
    ['an admin route', '/app/admin'],
    ['an encoded-slash traversal-shaped patient route', '/app/patient/%2F..%2Fadmin'],
    ['an encoded-dot traversal-shaped patient route', '/app/patient/%2e%2e/admin'],
    ['a raw backslash traversal-shaped patient route', '/app/patient\\..\\admin'],
    ['a raw traversal normalized back to a patient route', '/app/patient/../patient'],
    [
      'a protocol-relative URL with an otherwise valid explicit surface',
      '//therapygo.example.test/app/patient',
      { pushSurface: 'therapygo' },
    ],
  ])('does not dispatch native Push for %s', async (_case, url, pushExtras?: unknown) => {
    const providerFetch = vi.fn();
    globalThis.fetch = providerFetch as never;
    const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: nativeOnlyPort() });

    const result = await runWithOrganizationPrincipal(ORG, () =>
      adapter.send(intent({ url, pushExtras })),
    );

    expect(providerFetch).not.toHaveBeenCalled();
    expect(result.webPushOutcome).toMatchObject({ status: 'skipped', reason: 'no_active_target' });
  });

  it.each([
    ['a canonical patient route', '/app/patient/notifications', 'therapygo'],
    ['a canonical staff route', '/app/doctor/appointments', 'therapysto'],
  ])('dispatches native Push only to the matching provider target for %s', async (_case, url, expectedSurface) => {
    const sentTo: string[] = [];
    globalThis.fetch = vi.fn(async (_input: unknown, init?: { body?: unknown }) => {
      const body = JSON.parse(String(init?.body)) as { data: { pushSurface: string } };
      sentTo.push(body.data.pushSurface);
      return new Response(JSON.stringify({}), { status: 200 });
    }) as never;
    const port: WebPushAccessPort = {
      ...nativeOnlyPort(),
      getNativeTargetsForUser: vi.fn(async () => [
        { id: 'target-therapygo', appId: 'therapygo', provider: 'rustore', token: 'tok-go' },
        { id: 'target-therapysto', appId: 'therapysto', provider: 'rustore', token: 'tok-sto' },
      ]),
    };
    const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: port });

    await runWithOrganizationPrincipal(ORG, () => adapter.send(intent({ url })));

    expect(sentTo).toEqual([expectedSurface]);
  });

  it('revalidates an untrusted production access response before native provider dispatch', async () => {
    const providerFetch = vi.fn();
    globalThis.fetch = providerFetch as never;
    const port: WebPushAccessPort = {
      ...nativeOnlyPort(),
      getNativeTargetsForUser: vi.fn(async () => [
        { id: 'target-untrusted', appId: 'not-an-app', provider: 'not-a-provider', token: 'tok' },
      ]),
    };
    const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: port });

    const result = await runWithOrganizationPrincipal(ORG, () =>
      adapter.send(intent({ url: '/app/patient', pushExtras: { pushSurface: 'therapygo' } })),
    );

    expect(providerFetch).not.toHaveBeenCalled();
    expect(result.webPushOutcome).toMatchObject({ status: 'skipped' });
  });
});
