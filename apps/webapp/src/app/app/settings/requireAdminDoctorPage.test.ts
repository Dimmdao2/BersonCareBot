import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePlatformOperationsPageMock, redirectMock } = vi.hoisted(() => ({
  requirePlatformOperationsPageMock: vi.fn(),
  redirectMock: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePlatformOperationsPage: requirePlatformOperationsPageMock,
  requireDoctorWorkspaceContext: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { requireGlobalAdminDoctorPage } from "./requireAdminDoctorPage";

describe("requireGlobalAdminDoctorPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["doctor", false],
    ["doctor", true],
    ["admin", false],
  ])("rejects role=%s adminMode=%s", async () => {
    requirePlatformOperationsPageMock.mockImplementation(() => {
      throw new Error("redirect:/app");
    });
    await expect(requireGlobalAdminDoctorPage()).rejects.toThrow("redirect:/app");
  });

  it("allows only global admin with admin mode", async () => {
    const session = { user: { role: "admin" }, adminMode: true };
    requirePlatformOperationsPageMock.mockResolvedValue(session);
    await expect(requireGlobalAdminDoctorPage()).resolves.toBe(session);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
