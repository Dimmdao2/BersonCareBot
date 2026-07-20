import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveOrganizationIdBySlugMock = vi.hoisted(() => vi.fn());
const stampBootstrapPrincipalMock = vi.hoisted(() => vi.fn());
const listBranchesMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const listSpecialistsMock = vi.hoisted(() => vi.fn());
const listServicesMock = vi.hoisted(() => vi.fn());
const listServiceLocationAvailabilityMock = vi.hoisted(() => vi.fn());
const listSpecialistServiceAvailabilityMock = vi.hoisted(() => vi.fn());
const withExplicitOrganizationPrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: { organizationId: string; source: string }, fn: () => Promise<unknown>) => fn()),
);

vi.mock("@/app-layer/principal/bootstrapPrincipal", () => ({
  stampBootstrapPrincipal: stampBootstrapPrincipalMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    clinicDirectory: {
      resolveOrganizationIdBySlug: resolveOrganizationIdBySlugMock,
    },
    bookingEngine: {
      catalog: {
        listBranches: listBranchesMock,
        getBranch: getBranchMock,
        listSpecialists: listSpecialistsMock,
      },
      services: {
        listServices: listServicesMock,
        listServiceLocationAvailability: listServiceLocationAvailabilityMock,
        listSpecialistServiceAvailability: listSpecialistServiceAvailabilityMock,
      },
    },
  }),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withExplicitOrganizationPrincipal: withExplicitOrganizationPrincipalMock,
}));

import {
  loadPublicOrganizationCitiesRsc,
  loadPublicOrganizationServicesForCityRsc,
  resolvePublicOrganizationBySlugRsc,
} from "./publicOrganizationBooking";

const ORGANIZATION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORGANIZATION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("public /book/{slug} chokepoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolvePublicOrganizationBySlugRsc", () => {
    it("stamps the bootstrap principal before resolving, and returns the organization on success", async () => {
      resolveOrganizationIdBySlugMock.mockResolvedValue(ORGANIZATION_A);

      await expect(resolvePublicOrganizationBySlugRsc("saas-test-clinic-a")).resolves.toEqual({
        organizationId: ORGANIZATION_A,
      });
      expect(stampBootstrapPrincipalMock).toHaveBeenCalledWith("app/book/[slug]:resolve-organization");
      expect(resolveOrganizationIdBySlugMock).toHaveBeenCalledWith("saas-test-clinic-a");
    });

    it("fails closed (null) for an unknown/unpublished/inactive slug — no enumeration", async () => {
      resolveOrganizationIdBySlugMock.mockResolvedValue(null);
      await expect(resolvePublicOrganizationBySlugRsc("no-such-clinic")).resolves.toBeNull();
    });
  });

  describe("loadPublicOrganizationCitiesRsc", () => {
    it("reads cities under the resolved organization principal", async () => {
      listBranchesMock.mockResolvedValue([
        {
          id: "33333333-3333-4333-8333-333333333333",
          organizationId: ORGANIZATION_A,
          cityCode: "moscow",
          title: "Москва",
          isActive: true,
          sortOrder: 0,
        },
      ]);

      await expect(loadPublicOrganizationCitiesRsc(ORGANIZATION_A)).resolves.toMatchObject({
        ok: true,
        cities: [{ code: "moscow", title: "Москва" }],
      });
      expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
        { organizationId: ORGANIZATION_A, source: "app/book/[slug]:load-cities" },
        expect.any(Function),
      );
      expect(listBranchesMock).toHaveBeenCalledWith(ORGANIZATION_A);
    });

    it("shows Online only when the slug-resolved organization has an active assigned service", async () => {
      const onlineBranchId = "33333333-3333-4333-8333-333333333339";
      const serviceId = "44444444-4444-4444-8444-444444444449";
      const specialistId = "55555555-5555-4555-8555-555555555559";
      listBranchesMock.mockResolvedValue([
        {
          id: onlineBranchId,
          organizationId: ORGANIZATION_A,
          cityCode: "online",
          title: "Онлайн",
          shortTitle: "Онлайн",
          isActive: true,
          sortOrder: 0,
        },
      ]);
      getBranchMock.mockResolvedValue({
        id: onlineBranchId,
        organizationId: ORGANIZATION_A,
        cityCode: "online",
        title: "Онлайн",
        isActive: true,
      });
      listServicesMock.mockResolvedValue([
        {
          id: serviceId,
          organizationId: ORGANIZATION_A,
          title: "Онлайн-консультация",
          description: null,
          durationMinutes: 60,
          priceMinor: 100000,
          isActive: true,
          publicWidgetVisible: true,
          adminManualOnly: false,
        },
      ]);
      listSpecialistsMock.mockResolvedValue([
        { id: specialistId, organizationId: ORGANIZATION_A, isActive: true },
      ]);
      listSpecialistServiceAvailabilityMock.mockResolvedValue([
        {
          id: "ssa-online",
          organizationId: ORGANIZATION_A,
          specialistId,
          serviceId,
          branchId: onlineBranchId,
          isActive: true,
        },
      ]);

      await expect(loadPublicOrganizationCitiesRsc(ORGANIZATION_A)).resolves.toEqual({
        ok: true,
        cities: [],
        onlineLocation: { id: onlineBranchId, cityCode: "online", title: "Онлайн" },
      });
      expect(listServicesMock).toHaveBeenCalledWith(ORGANIZATION_A);
      expect(listServicesMock).not.toHaveBeenCalledWith(ORGANIZATION_B);
    });
  });

  describe("loadPublicOrganizationServicesForCityRsc — tenant isolation", () => {
    it("never mixes another organization's branch into the resolved organization's city", async () => {
      // Clinic B has a branch in the same city code as clinic A, but a DIFFERENT id/org.
      listBranchesMock.mockImplementation(async (organizationId: string) => {
        if (organizationId === ORGANIZATION_A) {
          return [
            {
              id: "branch-a",
              organizationId: ORGANIZATION_A,
              cityCode: "moscow",
              title: "Клиника A — Москва",
              isActive: true,
              sortOrder: 0,
            },
          ];
        }
        return [
          {
            id: "branch-b",
            organizationId: ORGANIZATION_B,
            cityCode: "moscow",
            title: "Клиника B — Москва",
            isActive: true,
            sortOrder: 0,
          },
        ];
      });
      getBranchMock.mockImplementation(async (branchId: string) =>
        branchId === "branch-a"
          ? { id: "branch-a", organizationId: ORGANIZATION_A, cityCode: "moscow", title: "Клиника A — Москва", isActive: true }
          : null,
      );
      listServicesMock.mockResolvedValue([]);
      listServiceLocationAvailabilityMock.mockResolvedValue([]);
      listSpecialistServiceAvailabilityMock.mockResolvedValue([]);
      listSpecialistsMock.mockResolvedValue([]);

      const result = await loadPublicOrganizationServicesForCityRsc(ORGANIZATION_A, "moscow");

      expect(result).toMatchObject({ ok: true, branchId: "branch-a" });
      expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
        { organizationId: ORGANIZATION_A, source: "app/book/[slug]:load-services" },
        expect.any(Function),
      );
      // Every downstream catalog read is scoped to organization A only — organization B's branch
      // is never looked up or returned, proving slug A cannot surface clinic B's catalog.
      expect(listBranchesMock).toHaveBeenCalledWith(ORGANIZATION_A);
      expect(listBranchesMock).not.toHaveBeenCalledWith(ORGANIZATION_B);
      expect(getBranchMock).not.toHaveBeenCalledWith("branch-b");
    });

    it("fails closed with city_not_found when the resolved organization has no active branch for the city", async () => {
      listBranchesMock.mockResolvedValue([]);

      await expect(loadPublicOrganizationServicesForCityRsc(ORGANIZATION_A, "spb")).resolves.toEqual({
        ok: false,
        error: "city_not_found",
        services: [],
      });
    });
  });
});
