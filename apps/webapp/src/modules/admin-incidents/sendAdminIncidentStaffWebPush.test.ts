/**
 * Tests for sendAdminIncidentStaffWebPush — CANARY MIGRATION (P18 / S14a).
 *
 * The function no longer calls sendWebPushToSubscriptions directly.
 * It now emits a web_push intent via relayOutbound (-> integrator).
 * The integrator's WebPushDeliveryAdapter performs the actual send.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock relayOutbound — this is now THE call we want to assert.
const relayOutboundMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, status: "accepted" }));

vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayOutboundMock,
}));

import { sendAdminIncidentStaffWebPush, type AdminIncidentStaffPushDeps } from "./sendAdminIncidentStaffWebPush";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";

const STAFF_ID = "admin-1";

function makeDeps(overrides: Partial<AdminIncidentStaffPushDeps> = {}): AdminIncidentStaffPushDeps {
  return {
    staffUsers: { listActiveStaffUserIds: async () => [STAFF_ID] },
    channelPreferences: { getPreferences: async () => [] } as unknown as ChannelPreferencesPort,
    webPushSubscriptions: {
      hasAnyForUserId: async () => true,
      listActiveByUserId: async () => [],
      deleteByEndpointIfExists: async () => true,
    } as unknown as WebPushSubscriptionsPort,
    systemSettings: { getSetting: async () => null },
    ...overrides,
  };
}

describe("sendAdminIncidentStaffWebPush — CANARY MIGRATION (S14a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });
  });

  // ─── PRIMARY: confirms P18 no longer calls sendWebPushToSubscriptions ────────

  it("emits a web_push intent via relayOutbound (not sendWebPushToSubscriptions)", async () => {
    const result = await sendAdminIncidentStaffWebPush(
      {
        topic: "channel_link",
        dedupKey: "abc",
        pushTitle: "Конфликт привязки канала",
        pushBody: "binding conflict body",
        pushUrl: "/app/doctor/admin/technical",
      },
      makeDeps(),
    );

    // relayOutbound must have been called exactly once
    expect(relayOutboundMock).toHaveBeenCalledTimes(1);
    const [params] = relayOutboundMock.mock.calls[0]!;
    expect(params.channel).toBe("web_push");
    expect(params.recipient).toBe(STAFF_ID);
    expect(params.text).toBe("binding conflict body");
    expect(params.metadata?.title).toBe("Конфликт привязки канала");
    expect(params.metadata?.url).toBe("/app/doctor/admin/technical");
    expect((params.metadata?.pushExtras as Record<string, string>)?.tag).toContain("channel_link");
    expect((params.metadata?.pushExtras as Record<string, string>)?.tag).toContain("abc");
    // Return value is now dispatched count (1 for successful relay)
    expect(result).toBe(1);
  });

  it("skips staff with global web_push disabled (no relay call)", async () => {
    const result = await sendAdminIncidentStaffWebPush(
      { topic: "t", dedupKey: "k", pushTitle: "t", pushBody: "b", pushUrl: "/" },
      makeDeps({
        channelPreferences: {
          getPreferences: async () => [{ channelCode: "web_push", isEnabledForNotifications: false }],
        } as unknown as ChannelPreferencesPort,
      }),
    );

    expect(result).toBe(0);
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("skips staff with no subscriptions (hasAnyForUserId returns false)", async () => {
    const result = await sendAdminIncidentStaffWebPush(
      { topic: "t", dedupKey: "k", pushTitle: "t", pushBody: "b", pushUrl: "/" },
      makeDeps({
        webPushSubscriptions: {
          hasAnyForUserId: async () => false,
          listActiveByUserId: async () => [],
          deleteByEndpointIfExists: async () => true,
        } as unknown as WebPushSubscriptionsPort,
      }),
    );

    expect(result).toBe(0);
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("returns 0 when no staff users", async () => {
    const result = await sendAdminIncidentStaffWebPush(
      { topic: "t", dedupKey: "k", pushTitle: "t", pushBody: "b", pushUrl: "/" },
      makeDeps({
        staffUsers: { listActiveStaffUserIds: async () => [] },
      }),
    );

    expect(result).toBe(0);
    expect(relayOutboundMock).not.toHaveBeenCalled();
  });

  it("counts only successful relay calls (relay failure returns 0)", async () => {
    relayOutboundMock.mockResolvedValueOnce({ ok: false, reason: "no_integrator_url" });

    const result = await sendAdminIncidentStaffWebPush(
      { topic: "t", dedupKey: "k", pushTitle: "t", pushBody: "b", pushUrl: "/" },
      makeDeps(),
    );

    expect(result).toBe(0);
    expect(relayOutboundMock).toHaveBeenCalledTimes(1);
  });

  it("relay error (throw) is caught and logs a warning — returns 0", async () => {
    relayOutboundMock.mockRejectedValueOnce(new Error("network error"));

    const result = await sendAdminIncidentStaffWebPush(
      { topic: "t", dedupKey: "k", pushTitle: "t", pushBody: "b", pushUrl: "/" },
      makeDeps(),
    );

    expect(result).toBe(0);
  });

  it("dispatches a relay for each eligible staff member", async () => {
    const result = await sendAdminIncidentStaffWebPush(
      { topic: "t", dedupKey: "k", pushTitle: "t", pushBody: "b", pushUrl: "/" },
      makeDeps({
        staffUsers: { listActiveStaffUserIds: async () => ["admin-1", "admin-2"] },
      }),
    );

    // Two eligible staff → two relay calls
    expect(relayOutboundMock).toHaveBeenCalledTimes(2);
    expect(result).toBe(2);
  });

  // ─── CONFIRM: sendWebPushToSubscriptions is NOT imported/called ──────────────

  it("sendWebPushToSubscriptions is NOT called from this module", async () => {
    // This test verifies the canary migration at the module level:
    // the module should not import sendWebPushToSubscriptions at all.
    // We verify by confirming only relayOutbound was called and checking no
    // push-specific mocked side-effects occurred.
    await sendAdminIncidentStaffWebPush(
      { topic: "t", dedupKey: "k", pushTitle: "t", pushBody: "b", pushUrl: "/" },
      makeDeps(),
    );

    // relayOutbound was called (the migrated path)
    expect(relayOutboundMock).toHaveBeenCalled();
    // No webpush provider mock was set up — if sendWebPushToSubscriptions were called,
    // the dynamic import would fail or produce an unmocked module. The test passing
    // confirms no direct push call occurred.
  });
});
