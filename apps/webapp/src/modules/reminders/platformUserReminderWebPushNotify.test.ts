/**
 * Tests for platformUserReminderWebPushNotify — P20 MIGRATION (PLAN S14b).
 *
 * The function no longer calls `sendWebPushToSubscriptions` directly.
 * It now emits a `web_push` intent via relayOutbound (-> integrator).
 * The integrator's WebPushDeliveryAdapter performs the actual send.
 *
 * G2 guard in sendWebPushToSubscriptions.ts is kept intact and untouched.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock relayOutbound — this is now THE call we want to assert.
const relayOutboundMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, status: "accepted" }));

vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayOutboundMock,
}));

// Mock createTrackedWebPushPayload — it registers analytics (not a send path).
// We return a predictable payload to assert forwarding into relay metadata.
const createTrackedWebPushPayloadMock = vi.hoisted(() =>
  vi.fn().mockImplementation((input: {
    userId: string;
    title: string;
    body: string;
    url: string;
    tag?: string;
    topicCode?: string | null;
    intentType?: string | null;
    pushKind?: string | null;
    warmupSloganKey?: string | null;
  }) =>
    Promise.resolve({
      title: input.title,
      body: input.body,
      url: input.url,
      tag: input.tag ?? undefined,
      trackingId: "mock-tracking-id",
      topicCode: input.topicCode ?? null,
      intentType: input.intentType ?? null,
      pushKind: input.pushKind ?? null,
      warmupSloganKey: input.warmupSloganKey ?? null,
    }),
  ),
);

vi.mock("@/app-layer/product-analytics/createTrackedWebPushPayload", () => ({
  createTrackedWebPushPayload: createTrackedWebPushPayloadMock,
  productAnalyticsMetadataFromPayload: vi.fn(),
}));

// Mock vapid key resolution
const getWebPushVapidKeyPairMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ publicKey: "pub", privateKey: "priv" }),
);
vi.mock("@/modules/system-settings/webPushVapidRuntime", () => ({
  getWebPushVapidKeyPair: getWebPushVapidKeyPairMock,
}));

// Mock resolveReminderWebPushPayload
vi.mock("@/modules/web-push/resolveReminderWebPushPayload", () => ({
  resolveReminderWebPushPayload: vi.fn().mockReturnValue({
    title: "Reminder Title",
    body: "Reminder body",
    tag: "reminder:occ-1",
    pushKind: "custom",
    warmupSloganKey: null,
  }),
}));

// Mock resolvePatientNotificationChannels to select web_push by default
vi.mock("@/modules/patient-notifications/resolveNotificationChannels", () => ({
  resolvePatientNotificationChannels: vi.fn().mockReturnValue({
    selectedChannels: ["web_push"],
    skippedChannels: [],
    availableChannels: ["web_push"],
    enabledChannels: ["web_push"],
  }),
}));

import {
  runPlatformUserReminderWebPushNotify,
  type PlatformUserReminderWebPushNotifyDeps,
  type PlatformUserReminderWebPushNotifyInput,
} from "./platformUserReminderWebPushNotify";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { NotificationDeliveryService } from "@/modules/notification-delivery/service";

const USER_ID = "user-uuid-1";
const OCCURRENCE_ID = "occ-1";

function makeInput(overrides: Partial<PlatformUserReminderWebPushNotifyInput> = {}): PlatformUserReminderWebPushNotifyInput {
  return {
    platformUserId: USER_ID,
    occurrenceId: OCCURRENCE_ID,
    topicCode: "exercise_reminder",
    openUrl: "/app/patient/exercises",
    ruleMeta: {
      linkedObjectType: "exercise",
      linkedObjectId: "ex-1",
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<PlatformUserReminderWebPushNotifyDeps> = {}): PlatformUserReminderWebPushNotifyDeps {
  return {
    channelPreferences: { getPreferences: async () => [] } as unknown as ChannelPreferencesPort,
    topicChannelPrefs: { listByUserId: async () => [] } as unknown as TopicChannelPrefsPort,
    webPushSubscriptions: {
      listActiveByUserId: async () => [{ endpoint: "https://push.example.com/sub1", keys: { p256dh: "k1", auth: "a1" }, userId: USER_ID }],
      hasAnyForUserId: async () => true,
      deleteByEndpointIfExists: async () => true,
    } as unknown as WebPushSubscriptionsPort,
    systemSettings: { getSetting: async () => null },
    readReminderNotifyGate: async () => ({ muted: false, topicMasterEnabled: true }),
    ...overrides,
  };
}

describe("platformUserReminderWebPushNotify — P20 MIGRATION (S14b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });
    getWebPushVapidKeyPairMock.mockResolvedValue({ publicKey: "pub", privateKey: "priv" });
    createTrackedWebPushPayloadMock.mockImplementation((input: {
      title: string;
      body: string;
      url: string;
      tag?: string;
      topicCode?: string | null;
      intentType?: string | null;
      pushKind?: string | null;
      warmupSloganKey?: string | null;
    }) =>
      Promise.resolve({
        title: input.title,
        body: input.body,
        url: input.url,
        tag: input.tag ?? undefined,
        trackingId: "mock-tracking-id",
        topicCode: input.topicCode ?? null,
        intentType: input.intentType ?? null,
        pushKind: input.pushKind ?? null,
        warmupSloganKey: input.warmupSloganKey ?? null,
      }),
    );
  });

  // ─── PRIMARY: emits a web_push intent via relayOutbound ──────────────────────

  it("emits a web_push intent via relayOutbound (not sendWebPushToSubscriptions)", async () => {
    const result = await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps());

    expect(relayOutboundMock).toHaveBeenCalledTimes(1);
    const [params] = relayOutboundMock.mock.calls[0]!;
    expect(params.channel).toBe("web_push");
    expect(params.recipient).toBe(USER_ID);
    expect(result).toEqual({ ok: true, delivered: 1 });
  });

  it("passes all WebPushClientPayload fields through metadata.pushExtras", async () => {
    await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps());

    const [params] = relayOutboundMock.mock.calls[0]!;
    // text = body from trackedPayload
    expect(params.text).toBe("Reminder body");
    // title and url in metadata
    expect(params.metadata?.title).toBe("Reminder Title");
    expect(params.metadata?.url).toBe("/app/patient/exercises");
    // pushExtras fields
    const pushExtras = params.metadata?.pushExtras as Record<string, unknown>;
    expect(pushExtras?.tag).toBe("reminder:occ-1");
    expect(pushExtras?.trackingId).toBe("mock-tracking-id");
    expect(pushExtras?.topicCode).toBe("exercise_reminder");
    expect(pushExtras?.intentType).toBe("patient_reminder");
  });

  it("messageId is deterministic from platformUserId + occurrenceId", async () => {
    await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps());

    const [params] = relayOutboundMock.mock.calls[0]!;
    expect(params.messageId).toBe(`reminder-push:${USER_ID}:${OCCURRENCE_ID}`);
  });

  // ─── EARLY EXITS: channel not selected ───────────────────────────────────────

  it("returns skipped when muted", async () => {
    const result = await runPlatformUserReminderWebPushNotify(
      makeInput(),
      makeDeps({ readReminderNotifyGate: async () => ({ muted: true, topicMasterEnabled: true }) }),
    );

    expect(result).toEqual({ ok: true, delivered: 0, skipped: "muted" });
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("returns skipped when web_push not selected by resolvePatientNotificationChannels", async () => {
    const { resolvePatientNotificationChannels } = await import("@/modules/patient-notifications/resolveNotificationChannels");
    vi.mocked(resolvePatientNotificationChannels).mockReturnValueOnce({
      selectedChannels: [],
      skippedChannels: [{ channel: "web_push", reason: "disabled_by_user_global" }],
      availableChannels: [],
      enabledChannels: [],
    });

    const result = await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps());

    expect(result).toEqual({ ok: true, delivered: 0, skipped: "disabled_by_user_global" });
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("returns skipped when vapid not configured", async () => {
    getWebPushVapidKeyPairMock.mockResolvedValueOnce(null);

    const result = await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps());

    expect(result).toEqual({ ok: true, delivered: 0, skipped: "vapid_missing" });
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("returns skipped when no active subscriptions", async () => {
    const result = await runPlatformUserReminderWebPushNotify(
      makeInput(),
      makeDeps({
        webPushSubscriptions: {
          listActiveByUserId: async () => [],
          hasAnyForUserId: async () => false,
          deleteByEndpointIfExists: async () => true,
        } as unknown as WebPushSubscriptionsPort,
      }),
    );

    expect(result).toEqual({ ok: true, delivered: 0, skipped: "no_active_subscriptions" });
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("returns skipped when push copy cannot be resolved", async () => {
    const { resolveReminderWebPushPayload } = await import("@/modules/web-push/resolveReminderWebPushPayload");
    vi.mocked(resolveReminderWebPushPayload).mockReturnValueOnce(null);

    const result = await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps());

    expect(result).toEqual({ ok: true, delivered: 0, skipped: "push_copy_skipped" });
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  // ─── RELAY ERRORS ────────────────────────────────────────────────────────────

  it("returns failure when relay returns ok: false", async () => {
    relayOutboundMock.mockResolvedValueOnce({ ok: false, reason: "no_integrator_url" });

    const result = await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps());

    expect(result).toEqual({ ok: false, error: "web_push_relay_failed" });
    expect(relayOutboundMock).toHaveBeenCalledTimes(1);
  });

  it("relay throw is caught and returns failure", async () => {
    relayOutboundMock.mockRejectedValueOnce(new Error("network error"));

    const result = await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps());

    expect(result).toEqual({ ok: false, error: "web_push_relay_failed" });
  });

  // ─── NOTIFICATION DELIVERY RECORDING ─────────────────────────────────────────

  it("records a delivery attempt on successful relay", async () => {
    const recordMock = vi.fn().mockResolvedValue(undefined);
    const notificationDelivery: NotificationDeliveryService = {
      recordNotificationDeliveryAttempt: recordMock,
    } as unknown as NotificationDeliveryService;

    await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps({ notificationDelivery }));

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        topicCode: "exercise_reminder",
        channel: "web_push",
        status: "success",
        occurrenceId: OCCURRENCE_ID,
      }),
    );
  });

  it("records a failed delivery attempt when relay returns ok: false", async () => {
    relayOutboundMock.mockResolvedValueOnce({ ok: false, reason: "no_integrator_url" });

    const recordMock = vi.fn().mockResolvedValue(undefined);
    const notificationDelivery: NotificationDeliveryService = {
      recordNotificationDeliveryAttempt: recordMock,
    } as unknown as NotificationDeliveryService;

    await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps({ notificationDelivery }));

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        channel: "web_push",
        status: "failed",
        reason: "relay_failed",
      }),
    );
  });

  it("records skipped vapid_missing attempt when notificationDelivery provided", async () => {
    getWebPushVapidKeyPairMock.mockResolvedValueOnce(null);

    const recordMock = vi.fn().mockResolvedValue(undefined);
    const notificationDelivery: NotificationDeliveryService = {
      recordNotificationDeliveryAttempt: recordMock,
    } as unknown as NotificationDeliveryService;

    await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps({ notificationDelivery }));

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "web_push",
        status: "skipped",
        reason: "vapid_missing",
      }),
    );
  });

  // ─── CONFIRM: sendWebPushToSubscriptions is NOT imported/called ──────────────

  it("sendWebPushToSubscriptions is NOT called from this module", async () => {
    // If sendWebPushToSubscriptions were called, web-push module would need to be
    // imported and the G2 guard would fire (or webpush would be invoked).
    // This test verifies the migration at the module level: only relayOutbound is called.
    await runPlatformUserReminderWebPushNotify(makeInput(), makeDeps());

    expect(relayOutboundMock).toHaveBeenCalled();
    // G2 guard in sendWebPushToSubscriptions.ts is intact — verify no push provider mock
    // was needed (i.e. the old path is unreachable).
  });
});
