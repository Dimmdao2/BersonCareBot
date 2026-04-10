/**
 * Интеграция profile server actions с {@link patientOnboardingServerActionSurfaceOk} (D-SA-1).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const requirePatientAccessMock = vi.hoisted(() => vi.fn());
const updateDisplayNameMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientAccess: requirePatientAccessMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userProjection: { updateDisplayName: updateDisplayNameMock },
  }),
}));

import { updateDisplayName, setPreferredAuthOtpChannelAction } from "./actions";

describe("profile server actions — onboarding surface enforcement", () => {
  beforeEach(() => {
    headersMock.mockReset();
    requirePatientAccessMock.mockReset();
    updateDisplayNameMock.mockReset();
  });

  it("updateDisplayName skips session and DB when pathname is not profile", async () => {
    headersMock.mockResolvedValue({
      get: (name: string) => (name === "x-bc-pathname" ? "/app/patient/diary" : null),
    });

    await updateDisplayName("New Name");

    expect(requirePatientAccessMock).not.toHaveBeenCalled();
    expect(updateDisplayNameMock).not.toHaveBeenCalled();
  });

  it("setPreferredAuthOtpChannelAction returns error when pathname is not profile", async () => {
    headersMock.mockResolvedValue({
      get: (name: string) => (name === "x-bc-pathname" ? "/app/patient/reminders" : null),
    });

    const r = await setPreferredAuthOtpChannelAction("auto");
    expect(r).toEqual({ ok: false, message: "Действие доступно только со страницы профиля" });
    expect(requirePatientAccessMock).not.toHaveBeenCalled();
  });
});
