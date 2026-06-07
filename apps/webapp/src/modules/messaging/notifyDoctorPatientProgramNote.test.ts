import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDoctorPatientProgramDeepLink,
  buildDoctorPatientProgramNoteNotifyText,
  notifyDoctorPatientProgramNote,
} from "./notifyDoctorPatientProgramNote";

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getAppBaseUrlSync: vi.fn(() => "https://app.example"),
}));

vi.mock("@/modules/messaging/doctorNotifyTargets", () => ({
  loadDoctorNotifyTargets: vi.fn(),
  relayTextToDoctorTargets: vi.fn(),
}));

vi.mock("@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff", () => ({
  notifyDoctorPatientMessageToStaff: vi.fn(),
}));

import { getAppBaseUrlSync } from "@/modules/system-settings/integrationRuntime";
import {
  loadDoctorNotifyTargets,
  relayTextToDoctorTargets,
} from "@/modules/messaging/doctorNotifyTargets";
import { notifyDoctorPatientMessageToStaff, type NotifyDoctorPatientMessageToStaffDeps } from "@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";

const patientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const instanceId = "11111111-1111-4111-8111-111111111111";
const stageItemId = "22222222-2222-4222-8222-222222222222";
const staffDeps: NotifyDoctorPatientMessageToStaffDeps = {
  staffUsers: { listActiveStaffUserIds: async () => ["doc-1"] },
  topicChannelPrefs: { listByUserId: async () => [], upsert: async () => {} },
  channelPreferences: { getPreferences: async () => [] } as unknown as ChannelPreferencesPort,
  webPushSubscriptions: {
    hasAnyForUserId: async () => true,
    listActiveByUserId: async () => [],
    deleteByEndpointIfExists: async () => true,
  } as unknown as WebPushSubscriptionsPort,
  systemSettings: { getSetting: async () => null },
  getChannelBindings: async () => ({ telegramId: "123" }),
};

describe("notifyDoctorPatientProgramNote", () => {
  beforeEach(() => {
    vi.mocked(loadDoctorNotifyTargets).mockReset();
    vi.mocked(relayTextToDoctorTargets).mockReset();
    vi.mocked(notifyDoctorPatientMessageToStaff).mockReset();
    vi.mocked(loadDoctorNotifyTargets).mockResolvedValue({
      telegram: ["123"],
      max: [],
    });
    vi.mocked(relayTextToDoctorTargets).mockResolvedValue(undefined);
    vi.mocked(notifyDoctorPatientMessageToStaff).mockResolvedValue({
      telegramDelivered: 0,
      maxDelivered: 0,
      pushDelivered: 1,
    });
  });

  it("buildDoctorPatientProgramDeepLink uses app base when configured", () => {
    vi.mocked(getAppBaseUrlSync).mockReturnValue("https://app.example/");
    const link = buildDoctorPatientProgramDeepLink({ patientUserId, instanceId });
    expect(link).toBe(
      `https://app.example/app/doctor/clients/${patientUserId}/treatment-programs/${instanceId}`,
    );
  });

  it("buildDoctorPatientProgramDeepLink falls back to relative path without base", () => {
    vi.mocked(getAppBaseUrlSync).mockReturnValue("");
    const link = buildDoctorPatientProgramDeepLink({ patientUserId, instanceId });
    expect(link).toBe(`/app/doctor/clients/${patientUserId}/treatment-programs/${instanceId}`);
  });

  it("buildDoctorPatientProgramNoteNotifyText includes label, title and note preview", () => {
    const text = buildDoctorPatientProgramNoteNotifyText({
      patientLabel: "Иван",
      exerciseTitle: "Присед",
      notePreview: "  Болит колено ",
      deepLink: "https://app.example/p",
    });
    expect(text).toContain("Комментарий пациента к упражнению");
    expect(text).toContain("От: Иван");
    expect(text).toContain("Присед");
    expect(text).toContain("Болит колено");
    expect(text).toContain("Программа: https://app.example/p");
  });

  it("notifyDoctorPatientProgramNote uses staff topic delivery when staffDeps provided", async () => {
    await notifyDoctorPatientProgramNote(
      {
        patientUserId,
        instanceId,
        stageItemId,
        patientLabel: "Иван",
        exerciseTitle: "Присед",
        noteText: "Комментарий",
      },
      { staffDeps },
    );
    expect(notifyDoctorPatientMessageToStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        topicCode: "doctor_patient_program_notes",
        messageId: expect.stringMatching(/^patient-program-note:/),
        pushTitle: "Комментарий к упражнению",
        pushBody: "Иван: Комментарий",
        replyMarkup: expect.objectContaining({
          inline_keyboard: [[{ text: "Ответить", callback_data: `program_reply:${stageItemId}` }]],
        }),
      }),
      staffDeps,
    );
    expect(relayTextToDoctorTargets).not.toHaveBeenCalled();
  });

  it("notifyDoctorPatientProgramNote falls back to legacy relay without staffDeps", async () => {
    await notifyDoctorPatientProgramNote({
      patientUserId,
      instanceId,
      stageItemId,
      patientLabel: "Иван",
      exerciseTitle: "Присед",
      noteText: "Комментарий",
    });
    expect(relayTextToDoctorTargets).toHaveBeenCalledWith(
      expect.stringMatching(/^patient-program-note:/),
      { telegram: ["123"], max: [] },
      expect.stringContaining("Комментарий"),
      "patient-program-note",
      expect.objectContaining({
        inline_keyboard: [[{ text: "Ответить", callback_data: `program_reply:${stageItemId}` }]],
      }),
    );
    expect(notifyDoctorPatientMessageToStaff).not.toHaveBeenCalled();
  });

  it("notifyDoctorPatientProgramNote skips relay when no targets and no staffDeps", async () => {
    vi.mocked(loadDoctorNotifyTargets).mockResolvedValue({ telegram: [], max: [] });
    await notifyDoctorPatientProgramNote({
      patientUserId,
      instanceId,
      stageItemId,
      patientLabel: "Иван",
      exerciseTitle: "Присед",
      noteText: "Комментарий",
    });
    expect(relayTextToDoctorTargets).not.toHaveBeenCalled();
  });
});
