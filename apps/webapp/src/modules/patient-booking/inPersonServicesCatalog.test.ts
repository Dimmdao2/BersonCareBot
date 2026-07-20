import { describe, expect, it, vi } from "vitest";
import {
  listInPersonCitiesForOrganization,
  listInPersonServicesForBranch,
  resolveBookableOnlineLocationForOrganization,
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

  it("keeps the reserved Online branch out of the in-person city list", async () => {
    const onlineDeps = {
      bookingEngine: {
        ...deps.bookingEngine,
        catalog: {
          ...deps.bookingEngine.catalog,
          listBranches: vi.fn().mockResolvedValue([
            ...(await deps.bookingEngine.catalog.listBranches(organizationId)),
            {
              id: "550e8400-e29b-41d4-a716-446655440009",
              organizationId,
              title: "Онлайн",
              shortTitle: "Онлайн",
              color: null,
              cityCode: "online",
              address: null,
              timezone: "Europe/Moscow",
              isActive: true,
              sortOrder: 10,
            },
          ]),
        },
      },
    } satisfies InPersonServicesCatalogDeps;

    await expect(listInPersonCitiesForOrganization(onlineDeps, organizationId)).resolves.toMatchObject([
      { code: "msk" },
    ]);
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

  it("exposes Online only when active and assigned to an active exact-org specialist", async () => {
    const onlineBranchId = "550e8400-e29b-41d4-a716-446655440009";
    const onlineDeps = {
      bookingEngine: {
        ...deps.bookingEngine,
        catalog: {
          ...deps.bookingEngine.catalog,
          listBranches: vi.fn().mockResolvedValue([
            {
              id: onlineBranchId,
              organizationId,
              title: "Онлайн",
              shortTitle: "Онлайн",
              color: null,
              cityCode: "online",
              address: null,
              timezone: "Europe/Moscow",
              isActive: true,
              sortOrder: 0,
            },
          ]),
          getBranch: vi.fn().mockResolvedValue({
            id: onlineBranchId,
            organizationId,
            title: "Онлайн",
            shortTitle: "Онлайн",
            color: null,
            cityCode: "online",
            address: null,
            timezone: "Europe/Moscow",
            isActive: true,
            sortOrder: 0,
          }),
        },
        services: {
          ...deps.bookingEngine.services,
          listSpecialistServiceAvailability: vi.fn().mockResolvedValue([
            {
              id: "ssa-online",
              organizationId,
              specialistId,
              branchId: onlineBranchId,
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

    await expect(resolveBookableOnlineLocationForOrganization(onlineDeps, organizationId)).resolves.toEqual({
      id: onlineBranchId,
      cityCode: "online",
      title: "Онлайн",
    });

    const unassigned = {
      bookingEngine: {
        ...onlineDeps.bookingEngine,
        services: {
          ...onlineDeps.bookingEngine.services,
          listSpecialistServiceAvailability: vi.fn().mockResolvedValue([]),
        },
      },
    } satisfies InPersonServicesCatalogDeps;
    await expect(resolveBookableOnlineLocationForOrganization(unassigned, organizationId)).resolves.toBeNull();

    const inactive = {
      bookingEngine: {
        ...onlineDeps.bookingEngine,
        catalog: {
          ...onlineDeps.bookingEngine.catalog,
          listBranches: vi.fn().mockResolvedValue([
            {
              ...(await onlineDeps.bookingEngine.catalog.getBranch(onlineBranchId)),
              isActive: false,
            },
          ]),
        },
      },
    } satisfies InPersonServicesCatalogDeps;
    await expect(resolveBookableOnlineLocationForOrganization(inactive, organizationId)).resolves.toBeNull();
  });

  it("fails closed when a branch belongs to another organization", async () => {
    const listServices = vi.fn();
    const listSpecialistServiceAvailability = vi.fn();
    const foreignDeps = {
      bookingEngine: {
        catalog: {
          ...deps.bookingEngine.catalog,
          getBranch: vi.fn().mockResolvedValue({
            ...(await deps.bookingEngine.catalog.getBranch(branchId)),
            organizationId: "org-2",
          }),
        },
        services: {
          listServices,
          listSpecialistServiceAvailability,
        },
      },
    } satisfies InPersonServicesCatalogDeps;

    await expect(listInPersonServicesForBranch(foreignDeps, organizationId, branchId)).resolves.toBeNull();
    expect(listServices).not.toHaveBeenCalled();
    expect(listSpecialistServiceAvailability).not.toHaveBeenCalled();
  });
});
