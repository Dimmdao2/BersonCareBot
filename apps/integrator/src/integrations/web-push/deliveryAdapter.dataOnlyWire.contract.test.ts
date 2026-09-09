/**
 * #915 auditor-live oracle for the fixed data-only RuStore wire
 * (`.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/00-blind-killset.md` K8/K9/K10).
 *
 * Oracle: `MASTER_PLAN.md` M6-09 — the RuStore wire is fixed as exactly
 * `{pushSurface,notificationKind,route,title,body}`; `route` comes only from `nativeRoute`, never
 * the browser `url`; token/provider credentials and the analytics `pushKind` never enter it;
 * title/body are bounded to 120/240 Unicode code points.
 *
 * Failure caught: a future change to `deliveryAdapter.ts`'s native fan-out spreads `pushExtras`
 * (or another field) into the provider-facing `data` object instead of building it from the
 * five named fields — leaking `pushKind`, `tag`, `trackingId`, an internal target id, or an
 * unbounded title/body to the third-party RuStore provider.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebPushAccessPort } from '../../kernel/contracts/index.js';
import { createWebPushDeliveryAdapter } from './deliveryAdapter.js';
import { runWithOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';

const ORG = '0c3c1bb2-b42f-44b7-8398-1dc766abec2d';
const PUSH_USER = '3c91f0cf-ff9a-48f3-88e6-6bd773056fd3';

function port(overrides: Partial<WebPushAccessPort> = {}): WebPushAccessPort {
  return {
    getSubscriptionsForUser: vi.fn(async () => []),
    getVapidCredentials: vi.fn(async () => ({
      publicKey: 'public-key',
      privateKey: 'private-key',
      subject: 'mailto:ops@example.test',
    })),
    deleteSubscriptionByEndpoint: vi.fn(async () => false),
    getNativeTargetsForUser: vi.fn(async () => [
      { id: 'target-1', appId: 'therapygo', provider: 'rustore', token: 'tok-1' },
    ]),
    getRuStoreConfig: vi.fn(async () => ({
      endpoint: 'https://rustore.example.test/send',
      projectId: 'proj-1',
      authToken: 'super-secret-auth-token',
    })),
    deactivateNativeTarget: vi.fn(async () => true),
    ...overrides,
  } as WebPushAccessPort;
}

function intent(input: { title: string; body: string; url: string; pushExtras: Record<string, unknown> }) {
  return {
    type: 'message.send' as const,
    meta: { eventId: 'evt-wire', occurredAt: new Date().toISOString(), source: 'audit' },
    payload: {
      recipient: { pushUserId: PUSH_USER },
      message: { text: input.body },
      title: input.title,
      url: input.url,
      delivery: { channels: ['web_push'] },
      pushExtras: input.pushExtras,
    },
  } as never;
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('RuStore wire is data-only and fixed to exactly 5 keys — M6-09', () => {
  it('sends exactly {pushSurface,notificationKind,route,title,body}, route from nativeRoute not url, no extras/secrets', async () => {
    let sentData: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      const parsed = JSON.parse(String(init?.body)) as { message: { data: Record<string, unknown> } };
      sentData = parsed.message.data;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as never;
    const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: port() });

    await runWithOrganizationPrincipal(ORG, () =>
      adapter.send(
        intent({
          title: 'Напоминание о записи',
          body: 'Ваш визит завтра в 10:00',
          // The browser url is an absolute clinic/custom-domain link — must never leak into `route`.
          url: 'https://clinic.example.ru/app/patient/booking?from=push',
          pushExtras: {
            pushSurface: 'therapygo',
            nativeRoute: '/app/patient/booking',
            notificationKind: 'reminder',
            // Realistic analytics/tracking siblings a producer's pushExtras carries — none of
            // these belong on the native wire.
            pushKind: 'custom',
            tag: 'reminder:occ-1',
            trackingId: 'trk-abc123',
            topicCode: 'appointment_reminders',
          },
        }),
      ),
    );

    expect(sentData).toEqual({
      pushSurface: 'therapygo',
      notificationKind: 'reminder',
      route: '/app/patient/booking',
      title: 'Напоминание о записи',
      body: 'Ваш визит завтра в 10:00',
    });
    expect(JSON.stringify(sentData)).not.toMatch(/pushKind|trackingId|topicCode|tag|clinic\.example\.ru/);
  });

  it('truncates title/body to 120/240 Unicode code points before they reach the provider', async () => {
    let sentData: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      const parsed = JSON.parse(String(init?.body)) as { message: { data: Record<string, unknown> } };
      sentData = parsed.message.data;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as never;
    const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: port() });

    const longTitle = 'а'.repeat(150);
    const longBody = 'б'.repeat(300);
    await runWithOrganizationPrincipal(ORG, () =>
      adapter.send(
        intent({
          title: longTitle,
          body: longBody,
          url: '/app/patient',
          pushExtras: { pushSurface: 'therapygo', nativeRoute: '/app/patient', notificationKind: 'message' },
        }),
      ),
    );

    expect((sentData!.title as string).length).toBe(120);
    expect((sentData!.body as string).length).toBe(240);
    expect(sentData!.title).toBe('а'.repeat(120));
    expect(sentData!.body).toBe('б'.repeat(240));
  });

  it('skips native dispatch when the explicit pushSurface and nativeRoute name different surfaces (K1 mutual consistency)', async () => {
    const providerFetch = vi.fn();
    globalThis.fetch = providerFetch as never;
    const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: port() });

    const result = await runWithOrganizationPrincipal(ORG, () =>
      adapter.send(
        intent({
          title: 'Title',
          body: 'Body',
          url: '/app/patient',
          // A producer bug: claims therapygo but points the native route at therapysto's surface.
          pushExtras: { pushSurface: 'therapygo', nativeRoute: '/app/doctor/clients', notificationKind: 'message' },
        }),
      ),
    );

    expect(providerFetch).not.toHaveBeenCalled();
    expect(result.webPushOutcome).toMatchObject({ status: 'skipped', reason: 'no_active_target' });
  });

  it('resolves no native routing (and never queries native targets) for a notificationKind without a nativeRoute, even when the browser url happens to be a valid in-app page — the admin/operator producer shape (K1)', async () => {
    const providerFetch = vi.fn();
    globalThis.fetch = providerFetch as never;
    const getNativeTargetsForUser = vi.fn(async () => [
      { id: 'target-1', appId: 'therapysto', provider: 'rustore', token: 'tok-1' },
    ]);
    const adapter = createWebPushDeliveryAdapter({ webPushAccessPort: port({ getNativeTargetsForUser }) });

    const result = await runWithOrganizationPrincipal(ORG, () =>
      adapter.send(
        intent({
          title: 'Инцидент',
          body: 'Обнаружена проблема',
          // Deliberately a valid in-app therapysto page (unlike the real admin-incident/operator
          // producers, whose `url` targets the out-of-allowlist global-admin surface): the point
          // of this case is that an explicit `notificationKind` without an explicit `nativeRoute`
          // must never fall back to inferring a route from `url`, even when that would happen to
          // succeed — the route the producer intended for native must be named explicitly, not
          // guessed from a browser link that may target a different page/intent (M6-05/M6-09).
          url: '/app/doctor/communications',
          pushExtras: { pushSurface: 'therapysto', notificationKind: 'message' },
        }),
      ),
    );

    expect(getNativeTargetsForUser).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
    expect(result.webPushOutcome).toMatchObject({ status: 'skipped', reason: 'no_active_target' });
  });
});
