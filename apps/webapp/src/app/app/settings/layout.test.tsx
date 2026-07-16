/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireDoctorWorkspaceContextMock, listSettingsByScopeMock } = vi.hoisted(() => ({
  requireDoctorWorkspaceContextMock: vi.fn(),
  listSettingsByScopeMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceContext: () => requireDoctorWorkspaceContextMock(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { listSettingsByScope: listSettingsByScopeMock },
  }),
}));

vi.mock("@/shared/ui/doctor/shell/DoctorWorkspaceShell", () => ({
  DoctorWorkspaceShell: (props: unknown) => props,
}));

import SettingsLayout from "./layout";

describe("SettingsLayout", () => {
  beforeEach(() => {
    requireDoctorWorkspaceContextMock.mockReset();
    listSettingsByScopeMock.mockReset();
    requireDoctorWorkspaceContextMock.mockResolvedValue({
      session: {
        user: {
          userId: "00000000-0000-4000-8000-000000000001",
          role: "doctor",
          displayName: "Doctor",
        },
      },
      organizationId: "00000000-0000-4000-8000-000000000002",
      membershipId: "00000000-0000-4000-8000-000000000003",
      membershipRole: "admin",
      specialistId: null,
      canManageOrganization: true,
      canManageAllSpecialists: true,
    });
    listSettingsByScopeMock.mockResolvedValue([]);
  });

  it("resolves and stamps the staff workspace before reading restricted settings", async () => {
    const callOrder: string[] = [];
    requireDoctorWorkspaceContextMock.mockImplementation(async () => {
      callOrder.push("workspace");
      return {
        session: {
          user: {
            userId: "00000000-0000-4000-8000-000000000001",
            role: "doctor",
            displayName: "Doctor",
          },
        },
        organizationId: "00000000-0000-4000-8000-000000000002",
        membershipId: "00000000-0000-4000-8000-000000000003",
        membershipRole: "admin",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
      };
    });
    listSettingsByScopeMock.mockImplementation(async () => {
      callOrder.push("settings");
      return [];
    });

    await SettingsLayout({ children: null });

    expect(callOrder).toEqual(["workspace", "settings"]);
    expect(listSettingsByScopeMock).toHaveBeenCalledWith("doctor", {
      organizationId: "00000000-0000-4000-8000-000000000002",
    });
  });
});
