/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireStaffAccountPageMock,
  revalidatePathMock,
  getProfileEmailFieldsMock,
  getPreferencesMock,
  hasAnyForUserIdMock,
  upsertMock,
} = vi.hoisted(() => ({
  requireStaffAccountPageMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  getProfileEmailFieldsMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  hasAnyForUserIdMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireStaffAccountPage: requireStaffAccountPageMock,
}));
vi.mock("@/app-layer/routes/paths", () => ({
  routePaths: {
    account: "/app/account",
    settings: "/app/settings",
    doctorInstall: "/app/doctor/install",
  },
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userProjection: { getProfileEmailFields: getProfileEmailFieldsMock },
    channelPreferencesPort: { getPreferences: getPreferencesMock },
    webPushSubscriptions: { hasAnyForUserId: hasAnyForUserIdMock },
    topicChannelPrefs: { upsert: upsertMock },
  }),
}));

import { setDoctorTopicChannelNotificationEnabled } from "./doctorNotificationPrefsActions";

describe("shared account notification action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffAccountPageMock.mockResolvedValue({
      user: {
        userId: "management-owner-1",
        role: "doctor",
        bindings: { telegramId: null, maxId: null },
      },
      adminMode: false,
    });
    getProfileEmailFieldsMock.mockResolvedValue({ email: "owner@example.test", emailVerifiedAt: new Date() });
    getPreferencesMock.mockResolvedValue([{ channelCode: "web_push", isEnabledForNotifications: true }]);
    hasAnyForUserIdMock.mockResolvedValue(true);
    upsertMock.mockResolvedValue(undefined);
  });

  it("allows a management-only staff account through account.self without requiring clinical binding", async () => {
    await expect(
      setDoctorTopicChannelNotificationEnabled("doctor_patient_messages", "web_push", true),
    ).resolves.toEqual({ ok: true });

    expect(requireStaffAccountPageMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      "management-owner-1",
      "doctor_patient_messages",
      "web_push",
      true,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/account");
  });

  it("does not turn a rejected platform/global principal into a clinical or account write", async () => {
    requireStaffAccountPageMock.mockRejectedValue(new Error("platform_only"));

    await expect(
      setDoctorTopicChannelNotificationEnabled("doctor_patient_messages", "web_push", true),
    ).resolves.toEqual({ ok: false, message: "Не удалось сохранить настройки" });

    expect(upsertMock).not.toHaveBeenCalled();
    expect(hasAnyForUserIdMock).not.toHaveBeenCalled();
  });
});
