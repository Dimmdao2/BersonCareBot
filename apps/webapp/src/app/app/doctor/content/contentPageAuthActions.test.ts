import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

const updateLifecycle = vi.fn();
const getById = vi.fn();
const requireDoctorWorkspaceContext = vi.fn();
const requireEntitlementForAction = vi.fn();
const revalidatePath = vi.fn();

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceContext: (...args: unknown[]) => requireDoctorWorkspaceContext(...args),
}));

vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlementForAction: (...args: unknown[]) => requireEntitlementForAction(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentPages: {
      getById,
      updateLifecycle,
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { setContentPageRequiresAuth } from "./contentPageAuthActions";

describe("setContentPageRequiresAuth", () => {
  beforeEach(() => {
    updateLifecycle.mockReset();
    getById.mockReset();
    revalidatePath.mockReset();
    requireDoctorWorkspaceContext.mockReset();
    requireEntitlementForAction.mockReset();
    requireEntitlementForAction.mockResolvedValue({ ok: true });
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
      return { id: "page-1", slug: "faq", section: "help" };
    });
    updateLifecycle.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });
    revalidatePath.mockImplementation(() => {
      expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
    });
  });

  it("updates page auth under the selected organization principal", async () => {
    const result = await setContentPageRequiresAuth(" page-1 ", true);

    expect(result).toEqual({ ok: true });
    expect(requireDoctorWorkspaceContext).toHaveBeenCalledTimes(1);
    expect(getById).toHaveBeenCalledWith("page-1");
    expect(updateLifecycle).toHaveBeenCalledWith("page-1", { requiresAuth: true });
    expect(revalidatePath).toHaveBeenCalledWith("/app/doctor/content");
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("denies an entitlement-off workspace before reading or changing a page", async () => {
    requireEntitlementForAction.mockResolvedValueOnce({ ok: false, mechanic: "cms_pages" });

    await expect(setContentPageRequiresAuth("page-1", true)).resolves.toEqual({
      ok: false,
      error: "entitlement_required",
    });
    expect(getById).not.toHaveBeenCalled();
    expect(updateLifecycle).not.toHaveBeenCalled();
  });
});
