import { describe, expect, it, vi } from "vitest";
import {
  listInPersonServicesForBranch,
  resolveActiveBranchForCity,
} from "./inPersonServicesCatalog";

describe("inPersonServicesCatalog", () => {
  const organizationId = "org-1";
  const branchId = "550e8400-e29b-41d4-a716-446655440001";
  const serviceId = "550e8400-e29b-41d4-a716-446655440002";
  const specialistId = "550e8400-e29b-41d4-a716-446655440003";

  const deps = {
    bookingEngine: {
      organization: { getDefaultOrganizationId: vi.fn().mockResolvedValue(organizationId) },
      catalog: {
        listBranches: vi.fn().mockResolvedValue([
          { id: branchId, title: "Клиника", cityCode: "msk", isActive: true, sortOrder: 0, organizationId },
        ]),
        getBranch: vi.fn().mockResolvedValue({
          id: branchId,
          title: "Клиника",
          cityCode: "msk",
          isActive: true,
          organizationId,
        }),
        listSpecialists: vi.fn().mockResolvedValue([
          { id: specialistId, organizationId, isActive: true },
        ]),
      },
      services: {
        listServices: vi.fn().mockResolvedValue([
          {
            id: serviceId,
            organizationId,
            title: "Приём",
            description: null,
            durationMinutes: 60,
            priceMinor: 1000,
            isActive: true,
            publicWidgetVisible: true,
            adminManualOnly: false,
          },
        ]),
        listServiceLocationAvailability: vi.fn().mockResolvedValue([
          { branchId, serviceId, isActive: true },
        ]),
        listSpecialistServiceAvailability: vi.fn().mockResolvedValue([
          {
            id: "ssa-1",
            organizationId,
            specialistId,
            branchId,
            serviceId,
            isActive: true,
          },
        ]),
      },
    },
  } as never;

  it("resolveActiveBranchForCity returns branch by cityCode", async () => {
    await expect(resolveActiveBranchForCity(deps, organizationId, "msk")).resolves.toEqual({
      id: branchId,
      title: "Клиника",
      cityCode: "msk",
    });
  });

  it("listInPersonServicesForBranch returns public services for branch", async () => {
    const result = await listInPersonServicesForBranch(deps, organizationId, branchId);
    expect(result?.services).toEqual([
      {
        id: serviceId,
        title: "Приём",
        description: null,
        durationMinutes: 60,
        priceMinor: 1000,
      },
    ]);
  });

  it("does not expose a location-only service without an active specialist assignment", async () => {
    const locationOnlyDeps = {
      bookingEngine: {
        ...deps.bookingEngine,
        services: {
          ...deps.bookingEngine.services,
          listSpecialistServiceAvailability: vi.fn().mockResolvedValue([]),
        },
      },
    } as never;

    const result = await listInPersonServicesForBranch(
      locationOnlyDeps,
      organizationId,
      branchId,
    );

    expect(result?.services).toEqual([]);
  });

  it("uses the selected specialist assignment when one is provided", async () => {
    const anotherSpecialistId = "550e8400-e29b-41d4-a716-446655440004";
    const selectedDeps = {
      bookingEngine: {
        ...deps.bookingEngine,
        catalog: {
          ...deps.bookingEngine.catalog,
          listSpecialists: vi.fn().mockResolvedValue([
            { id: specialistId, organizationId, isActive: true },
            { id: anotherSpecialistId, organizationId, isActive: true },
          ]),
        },
      },
    } as never;

    await expect(
      listInPersonServicesForBranch(
        selectedDeps,
        organizationId,
        branchId,
        anotherSpecialistId,
      ),
    ).resolves.toMatchObject({ services: [] });
  });
});
