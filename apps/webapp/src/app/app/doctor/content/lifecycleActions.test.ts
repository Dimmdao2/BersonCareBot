import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForAction: async () => ({ ok: true }),
}));
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

const updateLifecycle = vi.fn();
const getById = vi.fn();
const requireDoctorWorkspaceContext = vi.fn();
const revalidatePath = vi.fn();

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceContext: (...args: unknown[]) => requireDoctorWorkspaceContext(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentPages: {
      updateLifecycle,
      getById,
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { applyContentLifecycle } from "./lifecycleActions";

describe("applyContentLifecycle", () => {
  beforeEach(() => {
    updateLifecycle.mockReset();
    getById.mockReset();
    revalidatePath.mockReset();
    requireDoctorWorkspaceContext.mockReset();
    requireDoctorWorkspaceContext.mockResolvedValue({
      session: { user: { userId: "11111111-1111-4111-8111-111111111111" } },
      organizationId: ORGANIZATION_ID,
      membershipId: "33333333-3333-4333-8333-333333333333",
      membershipRole: "doctor",
      specialistId: "44444444-4444-4444-8444-444444444444",
      canManageOrganization: false,
      canManageAllSpecialists: false,
    });
    getById.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
      return {
        id: "550e8400-e29b-41d4-a716-446655440000",
        slug: "faq",
        section: "help",
      };
    });
    updateLifecycle.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });
    revalidatePath.mockImplementation(() => {
      expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
    });
  });

  it("archives a page", async () => {
    const fd = new FormData();
    fd.set("id", "550e8400-e29b-41d4-a716-446655440000");
    fd.set("op", "archive");
    const res = await applyContentLifecycle(null, fd);
    expect(res.ok).toBe(true);
    expect(updateLifecycle).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      expect.objectContaining({ archivedAt: expect.any(String) }),
    );
    expect(getById).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000");
    expect(requireDoctorWorkspaceContext).toHaveBeenCalledTimes(1);
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});
