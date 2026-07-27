/**
 * P17 migration test (PLAN S14b): web_push leg now uses relayOutbound, not sendWebPushToSubscriptions.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const relayMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayMock,
}));

import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { notifyDoctorPatientMessageToStaff } from "./notifyDoctorPatientMessageToStaff";

describe("notifyDoctorPatientMessageToStaff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    relayMock.mockResolvedValue({ ok: true, status: "accepted" });
  });

  it("delivers telegram to staff with default fallback and binding", async () => {
    const result = await notifyDoctorPatientMessageToStaff(
      {
        organizationId: "11111111-1111-4111-8111-111111111111",
        topicCode: "doctor_patient_messages",
        messageId: "patient-msg-notify:m1",
        senderDisplayName: "Иван",
        notificationUrl: "https://app.example/app/doctor/messages",
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
      expect.objectContaining({
        channel: "telegram",
        recipient: "123",
        text: "новое сообщение от Иван\n\nhttps://app.example/app/doctor/messages",
      }),
    );
  });

  it.each([
    "patient@example.com",
    "+79991234567",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ])("uses a neutral patient label instead of unsafe sender value %s", async (unsafeLabel) => {
    await notifyDoctorPatientMessageToStaff(
      {
        organizationId: "11111111-1111-4111-8111-111111111111",
        topicCode: "doctor_patient_messages",
        messageId: "patient-msg-notify:unsafe",
        senderDisplayName: unsafeLabel,
        notificationUrl: "https://app.example/app/doctor/messages",
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

    expect(relayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "новое сообщение от пациента\n\nhttps://app.example/app/doctor/messages",
      }),
    );
    expect(relayMock.mock.calls[0]?.[0]?.text).not.toContain(unsafeLabel);
  });

  it("skips telegram when explicitly disabled in prefs", async () => {
    const result = await notifyDoctorPatientMessageToStaff(
      {
        organizationId: "11111111-1111-4111-8111-111111111111",
        topicCode: "doctor_patient_messages",
        messageId: "patient-msg-notify:m2",
        senderDisplayName: "Иван",
        notificationUrl: "https://app.example/app/doctor/messages",
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

  it("delivers web_push via relay-outbound when subscription exists (P17 migrated)", async () => {
    const result = await notifyDoctorPatientMessageToStaff(
      {
        organizationId: "11111111-1111-4111-8111-111111111111",
        topicCode: "doctor_patient_messages",
        messageId: "patient-msg-notify:m3",
        senderDisplayName: "Иван",
        notificationUrl: "https://app.example/app/doctor/messages",
      },
      {
        staffUsers: { listActiveStaffUserIds: async () => ["doc-1"] },
        topicChannelPrefs: { listByUserId: async () => [], upsert: async () => {} },
        channelPreferences: { getPreferences: async () => [] } as unknown as ChannelPreferencesPort,
        webPushSubscriptions: {
          hasAnyForUserId: async () => true,
          listActiveByUserId: async () => [],
          deleteByEndpointIfExists: async () => true,
        } as unknown as WebPushSubscriptionsPort,
        systemSettings: { getSetting: async () => null },
        getChannelBindings: async () => ({}),
      },
    );

    expect(result.pushDelivered).toBe(1);
    // P17: web_push now emits a relay-outbound intent, NOT a direct sendWebPushToSubscriptions call.
    expect(relayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "web_push",
        recipient: "doc-1",
        text: "новое сообщение от Иван",
        metadata: expect.objectContaining({
          title: "Новое сообщение",
          url: "https://app.example/app/doctor/messages",
        }),
      }),
    );
  });

  it("skips web_push when no subscription exists", async () => {
    const result = await notifyDoctorPatientMessageToStaff(
      {
        organizationId: "11111111-1111-4111-8111-111111111111",
        topicCode: "doctor_patient_messages",
        messageId: "patient-msg-notify:m4",
        senderDisplayName: "Иван",
        notificationUrl: "https://app.example/app/doctor/messages",
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
        getChannelBindings: async () => ({}),
      },
    );

    expect(result.pushDelivered).toBe(0);
    expect(relayMock).not.toHaveBeenCalled();
  });
});
