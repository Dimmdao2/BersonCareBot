/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireGlobalAdminDoctorPageMock } = vi.hoisted(() => ({
  requireGlobalAdminDoctorPageMock: vi.fn(),
}));

vi.mock("@/app/app/settings/requireAdminDoctorPage", () => ({
  requireGlobalAdminDoctorPage: () => requireGlobalAdminDoctorPageMock(),
}));

vi.mock("@/shared/ui/doctor/shell/DoctorWorkspaceShell", () => ({
  DoctorWorkspaceShell: (props: unknown) => props,
}));

import GlobalAdminSystemHealthLayout from "./layout";

describe("GlobalAdminSystemHealthLayout", () => {
  beforeEach(() => {
    requireGlobalAdminDoctorPageMock.mockReset();
  });

  it("renders the global operator shell without requiring a tenant workspace", async () => {
    requireGlobalAdminDoctorPageMock.mockResolvedValue({
      user: {
        userId: "53000000-0000-4000-8000-00000000d001",
        role: "admin",
        displayName: "Global operator",
        bindings: {},
      },
      issuedAt: 1,
      expiresAt: 9e9,
      adminMode: true,
    });

    const result = await GlobalAdminSystemHealthLayout({ children: "health" });

    expect(requireGlobalAdminDoctorPageMock).toHaveBeenCalledOnce();
    expect(result.props).toMatchObject({
      adminMode: true,
      userRole: "admin",
      userDisplayName: "Global operator",
      children: "health",
    });
    expect(result.props).not.toHaveProperty("workspaceContext");
  });

  it("fails closed when the global-admin guard rejects the session", async () => {
    requireGlobalAdminDoctorPageMock.mockRejectedValue(new Error("redirect:/app/doctor"));

    await expect(GlobalAdminSystemHealthLayout({ children: null })).rejects.toThrow("redirect:/app/doctor");
  });
});
