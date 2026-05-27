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

vi.mock("@/modules/messaging/notifyDoctorPatientMessage", () => ({
  doctorReplyCallbackConversationId: vi.fn((id: string) => `conv:${id}`),
}));

import { getAppBaseUrlSync } from "@/modules/system-settings/integrationRuntime";
import {
  loadDoctorNotifyTargets,
  relayTextToDoctorTargets,
} from "@/modules/messaging/doctorNotifyTargets";

const patientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const instanceId = "11111111-1111-4111-8111-111111111111";
const stageItemId = "22222222-2222-4222-8222-222222222222";

describe("notifyDoctorPatientProgramNote", () => {
  beforeEach(() => {
    vi.mocked(loadDoctorNotifyTargets).mockReset();
    vi.mocked(relayTextToDoctorTargets).mockReset();
    vi.mocked(loadDoctorNotifyTargets).mockResolvedValue({
      telegram: ["123"],
      max: [],
    });
    vi.mocked(relayTextToDoctorTargets).mockResolvedValue(undefined);
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

  it("notifyDoctorPatientProgramNote relays when targets exist", async () => {
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
        inline_keyboard: [[{ text: "Ответить", callback_data: `admin_reply:conv:${patientUserId}` }]],
      }),
    );
  });

  it("notifyDoctorPatientProgramNote skips relay when no targets", async () => {
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
