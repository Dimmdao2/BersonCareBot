import { describe, expect, it, vi, beforeEach } from "vitest";

const sendPushMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/system-settings/webPushVapidRuntime", () => ({
  getWebPushVapidKeyPair: vi.fn().mockResolvedValue({
    publicKey: "pub",
    privateKey: "priv",
  }),
}));

vi.mock("@/modules/web-push/sendWebPushToSubscriptions", () => ({
  sendWebPushToSubscriptions: sendPushMock,
}));

vi.mock("@/modules/outbound-email/sendTransactionalSmtp", () => ({
  smtpInnerFromValueJson: vi.fn().mockReturnValue({ success: false }),
}));

import { sendAdminIncidentStaffWebPush, type AdminIncidentStaffPushDeps } from "./sendAdminIncidentStaffWebPush";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";

const webPushSub = {
  endpoint: "https://push.example/e1",
  expirationTime: null,
  keys: { p256dh: "p", auth: "a" },
};

describe("sendAdminIncidentStaffWebPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendPushMock.mockResolvedValue({ delivered: 1, errors: 0, deactivated: 0 });
  });

  it("delivers push to staff with global web_push enabled", async () => {
    const delivered = await sendAdminIncidentStaffWebPush(
      {
        topic: "channel_link",
        dedupKey: "abc",
        pushTitle: "Конфликт привязки канала",
        pushBody: "channel_link binding conflict",
        pushUrl: "/app/doctor/admin/technical",
      },
      {
        staffUsers: { listActiveStaffUserIds: async () => ["admin-1"] },
        channelPreferences: { getPreferences: async () => [] } as unknown as ChannelPreferencesPort,
        webPushSubscriptions: {
          listActiveByUserId: async () => [webPushSub],
          deleteByEndpointIfExists: async () => true,
        } as unknown as WebPushSubscriptionsPort,
        systemSettings: { getSetting: async () => null },
      } satisfies AdminIncidentStaffPushDeps,
    );

    expect(delivered).toBe(1);
    expect(sendPushMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          title: "Конфликт привязки канала",
          url: "/app/doctor/admin/technical",
        }),
      }),
    );
  });

  it("skips staff with global web_push disabled", async () => {
    const delivered = await sendAdminIncidentStaffWebPush(
      {
        topic: "channel_link",
        dedupKey: "abc",
        pushTitle: "t",
        pushBody: "b",
        pushUrl: "/app/doctor/admin/technical",
      },
      {
        staffUsers: { listActiveStaffUserIds: async () => ["admin-1"] },
        channelPreferences: {
          getPreferences: async () => [{ channelCode: "web_push", isEnabledForNotifications: false }],
        } as unknown as ChannelPreferencesPort,
        webPushSubscriptions: {
          listActiveByUserId: async () => [webPushSub],
          deleteByEndpointIfExists: async () => true,
        } as unknown as WebPushSubscriptionsPort,
        systemSettings: { getSetting: async () => null },
      } satisfies AdminIncidentStaffPushDeps,
    );

    expect(delivered).toBe(0);
    expect(sendPushMock).not.toHaveBeenCalled();
  });
});
