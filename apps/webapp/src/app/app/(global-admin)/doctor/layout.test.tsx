/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePlatformOperationsPageMock } = vi.hoisted(() => ({
  requirePlatformOperationsPageMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePlatformOperationsPage: requirePlatformOperationsPageMock,
}));
vi.mock("@/shared/ui/doctor/shell/DoctorWorkspaceShell", () => ({
  DoctorWorkspaceShell: (props: unknown) => props,
}));

import GlobalAdminDoctorLayout from "./layout";

describe("GlobalAdminDoctorLayout", () => {
  beforeEach(() => requirePlatformOperationsPageMock.mockReset());

  it("renders a platform-only, tenantless shell for the adminMode landing", async () => {
    requirePlatformOperationsPageMock.mockResolvedValue({
      user: { userId: "53000000-0000-4000-8000-00000000d001", role: "admin", displayName: "Platform" },
      adminMode: true,
    });

    const result = await GlobalAdminDoctorLayout({ children: "platform" });

    expect(requirePlatformOperationsPageMock).toHaveBeenCalledOnce();
    expect(result.props).toMatchObject({
      adminMode: true,
      enableTenantRuntime: false,
      userRole: "admin",
      children: "platform",
    });
  });
});
