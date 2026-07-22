import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  InPersonBookingResolveError,
  resolveInPersonBookingContext,
  resolvePublicInPersonBookingOrganization,
} from "./inPersonBookingResolve";

describe("canonical in-person booking resolution", () => {
  const bookingScheduling = {
    resolvePublicBookingOrganization: vi.fn().mockResolvedValue("org-1"),
    resolveCanonicalInPersonContext: vi.fn().mockResolvedValue({
      organizationId: "org-1",
      branchId: "550e8400-e29b-41d4-a716-446655440001",
      serviceId: "550e8400-e29b-41d4-a716-446655440002",
    }),
  };
  const deps = {
    bookingEngine: {
      catalog: { getBranch: vi.fn().mockResolvedValue({ id: "branch-1", organizationId: "org-1" }) },
      services: { getService: vi.fn().mockResolvedValue({ id: "service-1", organizationId: "org-1" }) },
    },
    bookingScheduling,
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    bookingScheduling.resolvePublicBookingOrganization.mockResolvedValue("org-1");
    bookingScheduling.resolveCanonicalInPersonContext.mockResolvedValue({
      organizationId: "org-1",
      branchId: "550e8400-e29b-41d4-a716-446655440001",
      serviceId: "550e8400-e29b-41d4-a716-446655440002",
    });
  });

  it("resolves a canonical branchId+serviceId pair", async () => {
    const result = await resolveInPersonBookingContext(deps, {
      branchId: "550e8400-e29b-41d4-a716-446655440001",
      serviceId: "550e8400-e29b-41d4-a716-446655440002",
    });
    expect(result).toEqual({
      organizationId: "org-1",
      branchId: "550e8400-e29b-41d4-a716-446655440001",
      serviceId: "550e8400-e29b-41d4-a716-446655440002",
    });
    expect(bookingScheduling.resolveCanonicalInPersonContext).toHaveBeenCalledWith({
      organizationId: "org-1",
      branchId: "550e8400-e29b-41d4-a716-446655440001",
      serviceId: "550e8400-e29b-41d4-a716-446655440002",
    });
  });

  it("fails when canonical availability is missing", async () => {
    bookingScheduling.resolveCanonicalInPersonContext.mockResolvedValue(null);
    await expect(
      resolveInPersonBookingContext(deps, {
        branchId: "550e8400-e29b-41d4-a716-446655440001",
        serviceId: "550e8400-e29b-41d4-a716-446655440002",
      }),
    ).rejects.toThrow(InPersonBookingResolveError);
  });

  it("requires a full canonical pair for public booking", async () => {
    await expect(
      resolvePublicInPersonBookingOrganization(deps, {
        branchId: "550e8400-e29b-41d4-a716-446655440001",
      }),
    ).rejects.toThrow("invalid_in_person_keys");
    expect(bookingScheduling.resolvePublicBookingOrganization).not.toHaveBeenCalled();
  });
});
