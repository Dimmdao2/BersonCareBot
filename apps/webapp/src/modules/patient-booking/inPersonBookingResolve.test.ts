import { describe, expect, it, vi, beforeEach } from "vitest";
import { InPersonBookingResolveError, resolveInPersonBranchServiceId } from "./inPersonBookingResolve";

describe("resolveInPersonBranchServiceId", () => {
  const bookingScheduling = {
    resolveLegacyBranchServiceId: vi.fn().mockResolvedValue("bs-1"),
    resolveInPersonContext: vi.fn(),
  };
  const deps = {
    bookingEngine: {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue("org-1") },
      catalog: { listSpecialists: vi.fn().mockResolvedValue([{ id: "sp-1", isActive: true }]) },
    },
    bookingScheduling,
  } as never;

  beforeEach(() => {
    bookingScheduling.resolveLegacyBranchServiceId.mockResolvedValue("bs-1");
  });

  it("returns branchServiceId when provided", async () => {
    await expect(
      resolveInPersonBranchServiceId(deps, { branchServiceId: "legacy-bs" }),
    ).resolves.toBe("legacy-bs");
  });

  it("resolves from branchId and serviceId", async () => {
    await expect(
      resolveInPersonBranchServiceId(deps, {
        branchId: "550e8400-e29b-41d4-a716-446655440001",
        serviceId: "550e8400-e29b-41d4-a716-446655440002",
      }),
    ).resolves.toBe("bs-1");
  });

  it("throws when mapping missing", async () => {
    bookingScheduling.resolveLegacyBranchServiceId.mockResolvedValue(null);
    await expect(
      resolveInPersonBranchServiceId(deps, {
        branchId: "550e8400-e29b-41d4-a716-446655440001",
        serviceId: "550e8400-e29b-41d4-a716-446655440002",
      }),
    ).rejects.toThrow(InPersonBookingResolveError);
  });
});
