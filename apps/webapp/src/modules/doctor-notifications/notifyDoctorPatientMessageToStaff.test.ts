import { describe, expect, it, vi, beforeEach } from "vitest";

const relayMock = vi.hoisted(() => vi.fn());
const sendPushMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayMock,
}));

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

import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { notifyDoctorPatientMessageToStaff } from "./notifyDoctorPatientMessageToStaff";

describe("notifyDoctorPatientMessageToStaff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    relayMock.mockResolvedValue({ ok: true, status: "accepted" });
    sendPushMock.mockResolvedValue({ delivered: 1, errors: 0, deactivated: 0 });
  });

  it("delivers telegram to staff with default fallback and binding", async () => {
    const result = await notifyDoctorPatientMessageToStaff(
      {
        topicCode: "doctor_patient_messages",
        messageId: "patient-msg-notify:m1",
        text: "hello",
        pushTitle: "t",
        pushBody: "b",
        pushUrl: "/app/doctor/messages",
        replyMarkup: {
          inline_keyboard: [[{ text: "Ответить", callback_data: "admin_reply:webapp:platform:u1" }]],
        },
      },
      {
        staffUsers: { listActiveStaffUserIds: async () => ["doc-1"] },
        topicChannelPrefs: { listByUserId: async () => [], upsert: async () => {} },
        channelPreferences: { getPreferences: async () => [] } as unknown as ChannelPreferencesPort,
        webPushSubscriptions: {
          hasAnyForUserId: async () => false,
          listActiveByUserId: async () => [],
          deleteByEndpointIfExists: async () => true,
        } as unknown as WebPushSubscriptionsPort,
        systemSettings: { getSetting: async () => null },
        getChannelBindings: async () => ({ telegramId: "123" }),
      },
    );

    expect(result.telegramDelivered).toBe(1);
    expect(relayMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "telegram", recipient: "123" }),
    );
  });

  it("skips telegram when explicitly disabled in prefs", async () => {
    const result = await notifyDoctorPatientMessageToStaff(
      {
        topicCode: "doctor_patient_messages",
        messageId: "patient-msg-notify:m2",
        text: "hello",
        pushTitle: "t",
        pushBody: "b",
        pushUrl: "/app/doctor/messages",
        replyMarkup: {
          inline_keyboard: [[{ text: "Ответить", callback_data: "admin_reply:webapp:platform:u1" }]],
        },
      },
      {
        staffUsers: { listActiveStaffUserIds: async () => ["doc-1"] },
        topicChannelPrefs: {
          listByUserId: async () => [
            {
              topicCode: "doctor_patient_messages",
              channelCode: "telegram",
              isEnabled: false,
            },
          ],
          upsert: async () => {},
        },
        channelPreferences: { getPreferences: async () => [] } as unknown as ChannelPreferencesPort,
        webPushSubscriptions: {
          hasAnyForUserId: async () => false,
          listActiveByUserId: async () => [],
          deleteByEndpointIfExists: async () => true,
        } as unknown as WebPushSubscriptionsPort,
        systemSettings: { getSetting: async () => null },
        getChannelBindings: async () => ({ telegramId: "123" }),
      },
    );

    expect(result.telegramDelivered).toBe(0);
    expect(relayMock).not.toHaveBeenCalled();
  });

  it("delivers web_push by default when subscription and vapid exist", async () => {
    const result = await notifyDoctorPatientMessageToStaff(
      {
        topicCode: "doctor_patient_messages",
        messageId: "patient-msg-notify:m3",
        text: "hello",
        pushTitle: "Сообщение от пациента",
        pushBody: "Иван: hi",
        pushUrl: "/app/doctor/messages",
      },
      {
        staffUsers: { listActiveStaffUserIds: async () => ["doc-1"] },
        topicChannelPrefs: { listByUserId: async () => [], upsert: async () => {} },
        channelPreferences: { getPreferences: async () => [] } as unknown as ChannelPreferencesPort,
        webPushSubscriptions: {
          hasAnyForUserId: async () => true,
          listActiveByUserId: async () => [
            {
              endpoint: "https://push.example/sub",
              expirationTime: null,
              keys: { p256dh: "k", auth: "a" },
            },
          ],
          deleteByEndpointIfExists: async () => true,
        } as unknown as WebPushSubscriptionsPort,
        systemSettings: { getSetting: async () => null },
        getChannelBindings: async () => ({}),
      },
    );

    expect(result.pushDelivered).toBe(1);
    expect(sendPushMock).toHaveBeenCalled();
    expect(relayMock).not.toHaveBeenCalled();
  });
});
