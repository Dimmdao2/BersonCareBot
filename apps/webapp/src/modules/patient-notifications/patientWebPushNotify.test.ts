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

vi.mock("@/modules/system-settings/webPushVapidRuntime", () => ({
  getWebPushVapidKeyPair: vi.fn().mockResolvedValue({ publicKey: "pk", privateKey: "sk" }),
}));

vi.mock("@/modules/web-push/sendWebPushToSubscriptions", () => ({
  sendWebPushToSubscriptions: vi.fn().mockResolvedValue({ delivered: 1, errors: 0, deactivated: 0 }),
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
    listActiveByUserId: vi.fn().mockResolvedValue([{ endpoint: "e1" }]),
    deleteByEndpointIfExists: vi.fn(),
  },
  systemSettings: {
    getSetting: vi.fn().mockResolvedValue(null),
  },
  readReminderNotifyGate: vi.fn().mockResolvedValue({ muted: false, topicMasterEnabled: true }),
  patientInboundChatPort: {} as never,
} as unknown as PatientWebPushNotifyDeps);

describe("runPatientWebPushNotify appointment_lifecycle", () => {
  beforeEach(() => {
    vi.mocked(appendPatientInboundAdminMessage).mockClear();
  });

  it("appends chat message and uses messages openUrl for lifecycle push", async () => {
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

    const { sendWebPushToSubscriptions } = await import("@/modules/web-push/sendWebPushToSubscriptions");
    expect(sendWebPushToSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          url: expect.stringContaining("/app/patient/messages"),
        }),
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
});
