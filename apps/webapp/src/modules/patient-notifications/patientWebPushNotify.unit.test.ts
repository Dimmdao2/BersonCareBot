import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatientWebPushNotifyDeps } from './patientWebPushNotify';

const { relayOutboundMock } = vi.hoisted(() => ({
  relayOutboundMock: vi.fn(),
}));

vi.mock('@/modules/messaging/relayOutbound', () => ({ relayOutbound: relayOutboundMock }));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn(async () => 'Europe/Moscow'),
}));
vi.mock('@/app-layer/product-analytics/createTrackedWebPushPayload', () => ({
  createTrackedWebPushPayload: vi.fn(async (input: Record<string, unknown>) => ({
    title: input.title,
    body: input.body,
    url: input.url,
    trackingId: 'tracking-1',
  })),
}));

import {
  runPatientWebPushNotify,
  type IntegratorPatientWebPushNotifyBody,
} from './patientWebPushNotify';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PUSH_USER_ID = '22222222-2222-4222-8222-222222222222';

function body(): IntegratorPatientWebPushNotifyBody {
  return {
    organizationId: ORGANIZATION_ID,
    platformUserId: PUSH_USER_ID,
    topicCode: 'patient_news',
    intentType: 'news',
    openUrl: '/app/patient',
    stableKey: 'news-1',
    broadcastTitle: 'News',
  };
}

function deps(): PatientWebPushNotifyDeps {
  return {
    findPlatformUserByPhone: async () => null,
    channelPreferences: {
      getPreferences: async () => [],
      upsertPreference: async () => {
        throw new Error('not used');
      },
      getBroadcastNotificationFlagsBatch: async () => new Map(),
      getPreferredAuthChannelCode: async () => null,
      setPreferredAuthChannel: async () => undefined,
      getDefaultAuthOtpChannel: async () => null,
    },
    topicChannelPrefs: {
      listByUserId: async () => [],
      upsert: async () => undefined,
    },
    webPushSubscriptions: {
      saveSubscription: async () => undefined,
      removeSubscriptionByEndpoint: async () => undefined,
      removeSubscriptionsForUser: async () => undefined,
      hasAnyForUserId: async () => true,
      listActiveByUserId: async () => [],
      deleteByEndpointIfExists: async () => false,
    },
    systemSettings: { getSetting: async () => null },
    readReminderNotifyGate: async () => ({ muted: false, topicMasterEnabled: true }),
  };
}

beforeEach(() => {
  relayOutboundMock.mockReset();
});

describe('patient web-push relay delivery truth', () => {
  it('propagates relay failure so the caller can retry instead of reporting success', async () => {
    relayOutboundMock.mockResolvedValue({ ok: false, reason: 'dispatch_failed' });

    await expect(runPatientWebPushNotify(body(), deps())).rejects.toThrow(
      'PATIENT_WEB_PUSH_RELAY_FAILED:dispatch_failed',
    );
  });

  it.each([
    ['skipped' as const, 'relay_skipped'],
    ['duplicate' as const, 'relay_duplicate'],
  ])('reports relay %s with delivered=0', async (status, skipped) => {
    relayOutboundMock.mockResolvedValue({ ok: true, status });

    await expect(runPatientWebPushNotify(body(), deps())).resolves.toMatchObject({
      ok: true,
      skipped,
      webPushDelivered: 0,
      webPushErrors: 0,
    });
  });

  it('reports delivered=1 only for an accepted relay', async () => {
    relayOutboundMock.mockResolvedValue({ ok: true, status: 'accepted' });

    await expect(runPatientWebPushNotify(body(), deps())).resolves.toMatchObject({
      ok: true,
      webPushDelivered: 1,
      webPushErrors: 0,
    });
  });

  it('uses one organization-bound target snapshot on the signed integrator path', async () => {
    relayOutboundMock.mockResolvedValue({ ok: true, status: 'accepted' });
    const resolveDeliveryTarget = vi.fn(async () => ({
      userId: PUSH_USER_ID,
      topicCode: 'patient_news',
      selectedChannels: ['web_push' as const],
      skippedChannels: [],
      availableChannels: ['web_push' as const],
      enabledChannels: ['web_push' as const],
    }));

    await expect(
      runPatientWebPushNotify(body(), {
        resolveDeliveryTarget,
        systemSettings: { getSetting: async () => null },
      }),
    ).resolves.toMatchObject({ ok: true, webPushDelivered: 1 });
    expect(resolveDeliveryTarget).toHaveBeenCalledOnce();
    expect(resolveDeliveryTarget).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      platformUserId: PUSH_USER_ID,
      topicCode: 'patient_news',
    });
  });
});
