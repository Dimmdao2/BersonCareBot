import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

const { reorderSlugsMock, requireDoctorWorkspaceContextMock } = vi.hoisted(() => ({
  reorderSlugsMock: vi.fn(),
  requireDoctorWorkspaceContextMock: vi.fn(),
}));

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceContext: requireDoctorWorkspaceContextMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: { reorderSlugs: reorderSlugsMock },
  }),
}));

import { reorderContentSections } from "./reorderContentSections";

describe("reorderContentSections", () => {
  beforeEach(() => {
    reorderSlugsMock.mockReset();
    reorderSlugsMock.mockResolvedValue(undefined);
    requireDoctorWorkspaceContextMock.mockReset();
    requireDoctorWorkspaceContextMock.mockResolvedValue({
      session: { user: { userId: "11111111-1111-4111-8111-111111111111" } },
      organizationId: ORGANIZATION_ID,
      membershipId: "33333333-3333-4333-8333-333333333333",
      membershipRole: "doctor",
      specialistId: "44444444-4444-4444-8444-444444444444",
      canManageOrganization: false,
      canManageAllSpecialists: false,
    });
  });

  it("runs reorder under the selected organization principal", async () => {
    reorderSlugsMock.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });

    const res = await reorderContentSections(["a", "b"]);
    expect(res.ok).toBe(true);
    expect(reorderSlugsMock).toHaveBeenCalledWith(["a", "b"]);
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("rejects empty array", async () => {
    const res = await reorderContentSections([]);
    expect(res.ok).toBe(false);
    expect(reorderSlugsMock).not.toHaveBeenCalled();
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});
