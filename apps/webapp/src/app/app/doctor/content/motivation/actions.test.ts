import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

const {
  revalidatePathMock,
  reorderQuotesMock,
  requireDoctorAccessMock,
  requireDoctorWorkspaceContextMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  reorderQuotesMock: vi.fn(),
  requireDoctorAccessMock: vi.fn(),
  requireDoctorWorkspaceContextMock: vi.fn(),
}));

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/config/env", () => ({
  env: {
    DATABASE_URL: "postgres://unit-test",
  },
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: requireDoctorAccessMock,
  requireDoctorWorkspaceContext: requireDoctorWorkspaceContextMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorMotivationQuotesEditor: {
      reorderQuotes: reorderQuotesMock,
    },
  }),
}));

import { reorderMotivationQuotes } from "./actions";

describe("reorderMotivationQuotes", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    reorderQuotesMock.mockReset();
    requireDoctorAccessMock.mockReset();
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

  it("runs reorder under the selected organization principal and clears context after action", async () => {
    reorderQuotesMock.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });

    const result = await reorderMotivationQuotes([
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ]);

    expect(result).toEqual({ ok: true });
    expect(reorderQuotesMock).toHaveBeenCalledWith([
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/doctor/content/motivation");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/patient");
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});
