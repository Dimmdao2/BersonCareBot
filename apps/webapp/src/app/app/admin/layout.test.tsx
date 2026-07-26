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

import AdminLayout from "./layout";

describe("AdminLayout", () => {
  beforeEach(() => requirePlatformOperationsPageMock.mockReset());

  it("renders a platform-only, tenantless, flat-menu shell for /app/admin/* (owner ruling 2026-07-26: final home, merged from app/platform/layout.tsx)", async () => {
    requirePlatformOperationsPageMock.mockResolvedValue({
      user: { userId: "53000000-0000-4000-8000-00000000d001", role: "admin", displayName: "Platform" },
      adminMode: true,
    });

    const result = await AdminLayout({ children: "platform" });

    expect(requirePlatformOperationsPageMock).toHaveBeenCalledOnce();
    expect(result.props).toMatchObject({
      adminMode: true,
      enableTenantRuntime: false,
      menuKind: "platform",
      userRole: "admin",
      children: "platform",
    });
  });
});
