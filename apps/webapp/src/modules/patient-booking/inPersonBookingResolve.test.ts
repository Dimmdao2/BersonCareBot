import { describe, expect, it, vi, beforeEach } from "vitest";
import { InPersonBookingResolveError, resolveInPersonBranchServiceId } from "./inPersonBookingResolve";

describe("resolveInPersonBranchServiceId", () => {
  const bookingScheduling = {
    resolveLegacyBranchServiceId: vi.fn().mockResolvedValue("bs-1"),
    resolveInPersonContext: vi.fn().mockResolvedValue({ organizationId: "org-1" }),
  };
  const deps = {
    bookingEngine: {
      catalog: {
        getBranch: vi.fn().mockResolvedValue({ id: "branch-1", organizationId: "org-1" }),
        listSpecialists: vi.fn().mockResolvedValue([{ id: "sp-1", isActive: true }]),
      },
      services: {
        getService: vi.fn().mockResolvedValue({ id: "service-1", organizationId: "org-1" }),
      },
    },
    bookingScheduling,
  } as never;

  beforeEach(() => {
    bookingScheduling.resolveLegacyBranchServiceId.mockResolvedValue("bs-1");
    bookingScheduling.resolveInPersonContext.mockResolvedValue({ organizationId: "org-1" });
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
