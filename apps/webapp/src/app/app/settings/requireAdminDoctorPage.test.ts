import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireDoctorAccessMock, redirectMock } = vi.hoisted(() => ({
  requireDoctorAccessMock: vi.fn(),
  redirectMock: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: requireDoctorAccessMock,
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
  ])("rejects role=%s adminMode=%s", async (role, adminMode) => {
    requireDoctorAccessMock.mockResolvedValue({ user: { role }, adminMode });
    await expect(requireGlobalAdminDoctorPage()).rejects.toThrow("redirect:/app/doctor");
  });

  it("allows only global admin with admin mode", async () => {
    const session = { user: { role: "admin" }, adminMode: true };
    requireDoctorAccessMock.mockResolvedValue(session);
    await expect(requireGlobalAdminDoctorPage()).resolves.toBe(session);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
