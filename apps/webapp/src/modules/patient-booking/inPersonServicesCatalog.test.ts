import { describe, expect, it, vi } from "vitest";
import {
  listInPersonServicesForBranch,
  resolveActiveBranchForCity,
  type InPersonServicesCatalogDeps,
} from "./inPersonServicesCatalog";

describe("inPersonServicesCatalog", () => {
  const organizationId = "org-1";
  const branchId = "550e8400-e29b-41d4-a716-446655440001";
  const serviceId = "550e8400-e29b-41d4-a716-446655440002";
  const specialistId = "550e8400-e29b-41d4-a716-446655440003";

  const deps = {
    bookingEngine: {
      catalog: {
        listBranches: vi.fn().mockResolvedValue([
          {
            id: branchId,
            organizationId,
            title: "Клиника",
            shortTitle: null,
            color: null,
            cityCode: "msk",
            address: null,
            timezone: "Europe/Moscow",
            isActive: true,
            sortOrder: 0,
          },
        ]),
        getBranch: vi.fn().mockResolvedValue({
          id: branchId,
          organizationId,
          title: "Клиника",
          shortTitle: null,
          color: null,
          cityCode: "msk",
          address: null,
          timezone: "Europe/Moscow",
          isActive: true,
          sortOrder: 0,
        }),
        listSpecialists: vi.fn().mockResolvedValue([
          {
            id: specialistId,
            organizationId,
            fullName: "Специалист",
            description: null,
            isActive: true,
            sortOrder: 0,
          },
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
            bufferAfterMinutes: 0,
            priceMinor: 1000,
            isActive: true,
            prepaymentApplicable: false,
            usableInPackages: false,
            onlinePaymentApplicable: false,
            publicWidgetVisible: true,
            adminManualOnly: false,
            sortOrder: 0,
          },
        ]),
        listSpecialistServiceAvailability: vi.fn().mockResolvedValue([
          {
            id: "ssa-1",
            organizationId,
            specialistId,
            branchId,
            serviceId,
            roomId: null,
            cityCode: null,
            durationMinutesOverride: null,
            priceMinorOverride: null,
            isActive: true,
            sortOrder: 0,
          },
        ]),
      },
    },
  } satisfies InPersonServicesCatalogDeps;

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
    } satisfies InPersonServicesCatalogDeps;

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
            {
              id: specialistId,
              organizationId,
              fullName: "Специалист",
              description: null,
              isActive: true,
              sortOrder: 0,
            },
            {
              id: anotherSpecialistId,
              organizationId,
              fullName: "Другой специалист",
              description: null,
              isActive: true,
              sortOrder: 1,
            },
          ]),
        },
      },
    } satisfies InPersonServicesCatalogDeps;

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
