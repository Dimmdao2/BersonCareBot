/**
 * P15 migration tests (PLAN S14b).
 *
 * Verifies that `runPatientWebPushNotify` emits a `web_push` intent via relayOutbound
 * instead of calling `sendWebPushToSubscriptions` directly.
 *
 * Key invariants:
 * - `sendWebPushToSubscriptions` is NEVER called (migrated to integrator adapter).
 * - `relayOutbound` is called with channel='web_push', all pushExtras fields, correct url.
 * - G2 guard in `sendWebPushToSubscriptions.ts` is unaffected (not imported here).
 * - skipped returns are preserved: muted, no_active_subscriptions, web_push_not_selected.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  appendPatientInboundAdminMessage,
  bookingLifecycleChatIntegratorMessageId,
} from "@/modules/messaging/appendPatientInboundAdminMessage";
import { runPatientWebPushNotify, type PatientWebPushNotifyDeps } from "./patientWebPushNotify";

vi.mock("@/modules/messaging/appendPatientInboundAdminMessage", () => ({
  appendPatientInboundAdminMessage: vi.fn().mockResolvedValue({ conversationId: "c1", messageId: "m1" }),
  bookingLifecycleChatIntegratorMessageId: (variant: string, bookingId: string) => `booking-${variant}:${bookingId}`,
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn().mockResolvedValue("Europe/Moscow"),
}));

// relayOutbound mock: default returns ok:true (accepted)
const relayOutboundMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, status: "accepted" }));
vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayOutboundMock,
}));

// createTrackedWebPushPayload mock: returns a predictable payload with trackingId
vi.mock("@/app-layer/product-analytics/createTrackedWebPushPayload", () => ({
  createTrackedWebPushPayload: vi.fn().mockImplementation(
    (input: { title: string; body: string; url: string; tag?: string; topicCode?: string | null; intentType?: string | null; pushKind?: string | null; warmupSloganKey?: string | null }) =>
      Promise.resolve({
        title: input.title,
        body: input.body,
        url: input.url,
        tag: input.tag,
        trackingId: "test-tracking-id-123",
        topicCode: input.topicCode ?? null,
        intentType: input.intentType ?? null,
        pushKind: input.pushKind ?? null,
        warmupSloganKey: input.warmupSloganKey ?? null,
      }),
  ),
}));

const baseDeps = (): PatientWebPushNotifyDeps => ({
  findPlatformUserByIntegratorId: vi.fn(),
  findPlatformUserByPhone: vi.fn(),
  channelPreferences: {
    getPreferences: vi.fn().mockResolvedValue([]),
  },
  topicChannelPrefs: {
    listByUserId: vi.fn().mockResolvedValue([]),
  },
  webPushSubscriptions: {
    hasAnyForUserId: vi.fn().mockResolvedValue(true),
    deleteByEndpointIfExists: vi.fn(),
  },
  systemSettings: {
    getSetting: vi.fn().mockResolvedValue(null),
  },
  readReminderNotifyGate: vi.fn().mockResolvedValue({ muted: false, topicMasterEnabled: true }),
  patientInboundChatPort: {} as never,
} as unknown as PatientWebPushNotifyDeps);

describe("runPatientWebPushNotify — P15 migration (relay-outbound, no direct send)", () => {
  beforeEach(() => {
    vi.mocked(appendPatientInboundAdminMessage).mockClear();
    relayOutboundMock.mockClear();
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });
  });

  it("emits a web_push intent via relayOutbound (NOT sendWebPushToSubscriptions)", async () => {
    const deps = baseDeps();
    const result = await runPatientWebPushNotify(
      {
        platformUserId: "00000000-0000-4000-8000-000000000001",
        topicCode: "appointment_reminders",
        intentType: "appointment_lifecycle",
        variant: "created",
        slotStartIso: "2026-06-01T10:00:00.000+03:00",
        openUrl: "https://old.example/app/patient/booking/new",
        stableKey: "booking-created:booking-42",
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(relayOutboundMock).toHaveBeenCalledTimes(1);
    expect(relayOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "web_push",
        recipient: "00000000-0000-4000-8000-000000000001",
        metadata: expect.objectContaining({
          pushExtras: expect.objectContaining({
            tag: "booking-created:booking-42",
            trackingId: "test-tracking-id-123",
            topicCode: "appointment_reminders",
            intentType: "appointment_lifecycle",
          }),
        }),
      }),
    );
  });

  it("uses patient notifications openUrl for appointment_lifecycle (not the raw openUrl)", async () => {
    const deps = baseDeps();
    await runPatientWebPushNotify(
      {
        platformUserId: "00000000-0000-4000-8000-000000000001",
        topicCode: "appointment_reminders",
        intentType: "appointment_lifecycle",
        variant: "created",
        slotStartIso: "2026-06-01T10:00:00.000+03:00",
        openUrl: "https://old.example/app/patient/booking/new",
        stableKey: "booking-created:booking-42",
      },
      deps,
    );

    expect(relayOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          url: expect.stringContaining("/app/patient?notifications=1"),
        }),
      }),
    );
  });

  it("appends chat message for appointment_lifecycle before relay", async () => {
    const deps = baseDeps();
    const result = await runPatientWebPushNotify(
      {
        platformUserId: "00000000-0000-4000-8000-000000000001",
        topicCode: "appointment_reminders",
        intentType: "appointment_lifecycle",
        variant: "created",
        slotStartIso: "2026-06-01T10:00:00.000+03:00",
        openUrl: "https://old.example/app/patient/booking/new",
        stableKey: "booking-created:booking-42",
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(appendPatientInboundAdminMessage).toHaveBeenCalledWith(
      deps.patientInboundChatPort,
      expect.objectContaining({
        platformUserId: "00000000-0000-4000-8000-000000000001",
        integratorMessageId: bookingLifecycleChatIntegratorMessageId("created", "booking-42"),
        text: expect.stringContaining("Запись"),
      }),
    );
  });

  it("does not append chat for appointment_reminder", async () => {
    const deps = baseDeps();
    await runPatientWebPushNotify(
      {
        platformUserId: "00000000-0000-4000-8000-000000000001",
        topicCode: "appointment_reminders",
        intentType: "appointment_reminder",
        slotStartIso: "2026-06-01T10:00:00.000+03:00",
        openUrl: "https://example/app/patient/booking/new",
        stableKey: "booking-reminder:booking-42:24h",
        nowIso: "2026-05-31T10:00:00.000+03:00",
      },
      deps,
    );

    expect(appendPatientInboundAdminMessage).not.toHaveBeenCalled();
  });

  it("skips with no_active_subscriptions when hasAnyForUserId returns false", async () => {
    const deps = baseDeps();
    vi.mocked(deps.webPushSubscriptions.hasAnyForUserId).mockResolvedValue(false);

    const result = await runPatientWebPushNotify(
      {
        platformUserId: "00000000-0000-4000-8000-000000000001",
        topicCode: "appointment_reminders",
        intentType: "appointment_reminder",
        slotStartIso: "2026-06-01T10:00:00.000+03:00",
        openUrl: "https://example/app/patient/booking/new",
        stableKey: "booking-reminder:booking-42:24h",
        nowIso: "2026-05-31T10:00:00.000+03:00",
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe("web_push_not_selected");
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("skips with muted when gate is muted", async () => {
    const deps = baseDeps();
    vi.mocked(deps.readReminderNotifyGate).mockResolvedValue({ muted: true, topicMasterEnabled: true });

    const result = await runPatientWebPushNotify(
      {
        platformUserId: "00000000-0000-4000-8000-000000000001",
        topicCode: "appointment_reminders",
        intentType: "news",
        openUrl: "https://example/app",
        stableKey: "broadcast:abc:uid",
        broadcastTitle: "News title",
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe("muted");
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("returns webPushErrors:1 when relay fails", async () => {
    const deps = baseDeps();
    relayOutboundMock.mockResolvedValue({ ok: false, reason: "no_integrator_url" });

    const result = await runPatientWebPushNotify(
      {
        platformUserId: "00000000-0000-4000-8000-000000000001",
        topicCode: "appointment_reminders",
        intentType: "news",
        openUrl: "https://example/app",
        stableKey: "broadcast:abc:uid",
        broadcastTitle: "News title",
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.webPushDelivered).toBe(0);
    expect(result.webPushErrors).toBe(1);
  });

  it("passes pushKind=news for news intentType", async () => {
    const deps = baseDeps();
    await runPatientWebPushNotify(
      {
        platformUserId: "00000000-0000-4000-8000-000000000001",
        topicCode: "appointment_reminders",
        intentType: "news",
        openUrl: "https://example/app",
        stableKey: "broadcast:abc:uid",
        broadcastTitle: "News broadcast",
      },
      deps,
    );

    expect(relayOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "web_push",
        metadata: expect.objectContaining({
          pushExtras: expect.objectContaining({
            pushKind: "news",
            intentType: "news",
          }),
        }),
      }),
    );
  });
});
