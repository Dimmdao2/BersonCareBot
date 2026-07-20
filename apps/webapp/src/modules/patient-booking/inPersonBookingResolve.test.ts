import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  InPersonBookingResolveError,
  resolveInPersonBranchServiceId,
  resolvePublicInPersonBookingOrganization,
} from "./inPersonBookingResolve";

describe("resolveInPersonBranchServiceId", () => {
  const bookingScheduling = {
    resolvePublicBookingOrganization: vi.fn().mockResolvedValue("org-1"),
    resolveLegacyBranchServiceId: vi.fn().mockResolvedValue("bs-1"),
    resolveInPersonContext: vi.fn().mockResolvedValue({ organizationId: "org-1" }),
  };
  const deps = {
    bookingEngine: {
      catalog: {
        getBranch: vi.fn().mockResolvedValue({ id: "branch-1", organizationId: "org-1" }),
      },
      services: {
        getService: vi.fn().mockResolvedValue({ id: "service-1", organizationId: "org-1" }),
      },
    },
    bookingScheduling,
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    bookingScheduling.resolveLegacyBranchServiceId.mockResolvedValue("bs-1");
    bookingScheduling.resolveInPersonContext.mockResolvedValue({ organizationId: "org-1" });
    bookingScheduling.resolvePublicBookingOrganization.mockResolvedValue("org-1");
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
    expect(bookingScheduling.resolveLegacyBranchServiceId).toHaveBeenCalledWith({
      organizationId: "org-1",
      branchId: "550e8400-e29b-41d4-a716-446655440001",
      serviceId: "550e8400-e29b-41d4-a716-446655440002",
    });
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

  it("prefers canonical public keys over a supplied legacy id", async () => {
    await expect(
      resolvePublicInPersonBookingOrganization(deps, {
        branchId: "550e8400-e29b-41d4-a716-446655440001",
        serviceId: "550e8400-e29b-41d4-a716-446655440002",
        branchServiceId: "550e8400-e29b-41d4-a716-446655440003",
      }),
    ).resolves.toEqual({
      organizationId: "org-1",
      keys: {
        branchId: "550e8400-e29b-41d4-a716-446655440001",
        serviceId: "550e8400-e29b-41d4-a716-446655440002",
      },
    });
    expect(bookingScheduling.resolvePublicBookingOrganization).toHaveBeenCalledWith({
      branchId: "550e8400-e29b-41d4-a716-446655440001",
      serviceId: "550e8400-e29b-41d4-a716-446655440002",
    });
  });

  it("fails closed when the public resolver cannot prove one organization", async () => {
    bookingScheduling.resolvePublicBookingOrganization.mockResolvedValue(null);
    await expect(
      resolvePublicInPersonBookingOrganization(deps, { branchServiceId: "legacy-bs" }),
    ).rejects.toThrow("ambiguous_booking_tenant");
  });

  it("rejects a partial canonical pair even when a legacy id is supplied", async () => {
    await expect(
      resolvePublicInPersonBookingOrganization(deps, {
        branchId: "550e8400-e29b-41d4-a716-446655440001",
        branchServiceId: "legacy-bs",
      }),
    ).rejects.toThrow("invalid_in_person_keys");
    expect(bookingScheduling.resolvePublicBookingOrganization).not.toHaveBeenCalled();
  });
});
