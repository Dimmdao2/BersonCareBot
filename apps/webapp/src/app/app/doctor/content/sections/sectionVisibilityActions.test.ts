import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

const updateSection = vi.fn();
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
    contentSections: {
      update: updateSection,
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { setSectionRequiresAuth, setSectionVisibility } from "./sectionVisibilityActions";

describe("section visibility actions", () => {
  beforeEach(() => {
    updateSection.mockReset();
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
    updateSection.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });
    revalidatePath.mockImplementation(() => {
      expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
    });
  });

  it("updates section auth under the selected organization principal", async () => {
    const result = await setSectionRequiresAuth(" warmups ", true);

    expect(result).toEqual({ ok: true });
    expect(requireDoctorWorkspaceContext).toHaveBeenCalledTimes(1);
    expect(updateSection).toHaveBeenCalledWith("warmups", { requiresAuth: true });
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("updates section visibility under the selected organization principal", async () => {
    const result = await setSectionVisibility(" warmups ", false);

    expect(result).toEqual({ ok: true });
    expect(requireDoctorWorkspaceContext).toHaveBeenCalledTimes(1);
    expect(updateSection).toHaveBeenCalledWith("warmups", { isVisible: false });
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});
