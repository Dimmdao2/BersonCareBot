import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveCanonicalSlugMock = vi.hoisted(() => vi.fn());
const stampBootstrapPrincipalMock = vi.hoisted(() => vi.fn());
const listBranchesMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const listSpecialistsMock = vi.hoisted(() => vi.fn());
const listServicesMock = vi.hoisted(() => vi.fn());
const listServiceLocationAvailabilityMock = vi.hoisted(() => vi.fn());
const listSpecialistServiceAvailabilityMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const getMaxConsecutiveSlotHoursMock = vi.hoisted(() => vi.fn());
const withExplicitOrganizationPrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: { organizationId: string; source: string }, fn: () => Promise<unknown>) => fn()),
);

vi.mock("@/app-layer/principal/bootstrapPrincipal", () => ({
  stampBootstrapPrincipal: stampBootstrapPrincipalMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    clinicDirectory: {
      resolveCanonicalSlug: resolveCanonicalSlugMock,
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
    bookingScheduling: {
      resolveCanonicalInPersonContext: resolveCanonicalInPersonContextMock,
      getMaxConsecutiveSlotHours: getMaxConsecutiveSlotHoursMock,
    },
  }),
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withExplicitOrganizationPrincipal: withExplicitOrganizationPrincipalMock,
}));

import {
  loadPublicOrganizationCitiesRsc,
  loadPublicInPersonSlotContextForSlugRsc,
  loadPublicOrganizationServicesForCityRsc,
  resolvePublicOrganizationBySlugRsc,
} from "./publicOrganizationBooking";

const ORGANIZATION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORGANIZATION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("public /book/{slug} chokepoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMaxConsecutiveSlotHoursMock.mockResolvedValue(3);
  });

  describe("resolvePublicOrganizationBySlugRsc", () => {
    it("stamps the bootstrap principal before resolving, and returns the organization on success", async () => {
      resolveCanonicalSlugMock.mockResolvedValue({
        organizationId: ORGANIZATION_A,
        requestedSlug: "saas-test-clinic-a",
        canonicalSlug: "saas-test-clinic-a",
        disposition: "current",
      });

      await expect(resolvePublicOrganizationBySlugRsc("saas-test-clinic-a")).resolves.toEqual({
        organizationId: ORGANIZATION_A,
        canonicalSlug: "saas-test-clinic-a",
        disposition: "current",
      });
      expect(stampBootstrapPrincipalMock).toHaveBeenCalledWith("app/book/[slug]:resolve-organization");
      expect(resolveCanonicalSlugMock).toHaveBeenCalledWith("saas-test-clinic-a");
    });

    it("fails closed (null) for an unknown/unpublished/inactive slug — no enumeration", async () => {
      resolveCanonicalSlugMock.mockResolvedValue(null);
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

    it("keeps an online-only service in the public Online block and out of the physical location", async () => {
      const physicalBranchId = "33333333-3333-4333-8333-333333333333";
      const onlineBranchId = "33333333-3333-4333-8333-333333333339";
      const serviceId = "44444444-4444-4444-8444-444444444449";
      const specialistId = "55555555-5555-4555-8555-555555555559";
      listBranchesMock.mockResolvedValue([
        {
          id: physicalBranchId,
          organizationId: ORGANIZATION_A,
          cityCode: "moscow",
          title: "Москва",
          shortTitle: "Москва",
          isActive: true,
          sortOrder: 0,
        },
        {
          id: onlineBranchId,
          organizationId: ORGANIZATION_A,
          cityCode: "online",
          title: "Онлайн",
          shortTitle: "Онлайн",
          isActive: true,
          sortOrder: 1,
        },
      ]);
      getBranchMock.mockImplementation(async (branchId: string) => {
        if (branchId === physicalBranchId) {
          return {
            id: physicalBranchId,
            organizationId: ORGANIZATION_A,
            cityCode: "moscow",
            title: "Москва",
            isActive: true,
          };
        }
        if (branchId === onlineBranchId) {
          return {
            id: onlineBranchId,
            organizationId: ORGANIZATION_A,
            cityCode: "online",
            title: "Онлайн",
            isActive: true,
          };
        }
        return null;
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
        cities: [
          {
            id: physicalBranchId,
            code: "moscow",
            title: "Москва",
            isActive: true,
            sortOrder: 0,
            createdAt: "",
            updatedAt: "",
          },
        ],
        onlineLocation: { id: onlineBranchId, cityCode: "online", title: "Онлайн" },
      });
      await expect(loadPublicOrganizationServicesForCityRsc(ORGANIZATION_A, "moscow")).resolves.toMatchObject({
        ok: true,
        branchId: physicalBranchId,
        services: [],
      });
      await expect(loadPublicOrganizationServicesForCityRsc(ORGANIZATION_A, "online")).resolves.toMatchObject({
        ok: true,
        branchId: onlineBranchId,
        services: [{ id: serviceId, title: "Онлайн-консультация" }],
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

  describe("loadPublicInPersonSlotContextForSlugRsc", () => {
    it("derives display metadata from the slug-scoped canonical catalog and availability", async () => {
      const branchId = "33333333-3333-4333-8333-333333333333";
      const serviceId = "44444444-4444-4444-8444-444444444444";
      const specialistId = "55555555-5555-4555-8555-555555555555";
      resolveCanonicalSlugMock.mockResolvedValue({
        organizationId: ORGANIZATION_A,
        requestedSlug: "clinic-a",
        canonicalSlug: "clinic-a",
        disposition: "current",
      });
      getBranchMock.mockResolvedValue({
        id: branchId,
        organizationId: ORGANIZATION_A,
        cityCode: "moscow",
        title: "Не из URL",
        isActive: true,
      });
      listServicesMock.mockResolvedValue([
        {
          id: serviceId,
          organizationId: ORGANIZATION_A,
          title: "Каноническая услуга",
          durationMinutes: 60,
          priceMinor: 120000,
          isActive: true,
          publicWidgetVisible: true,
          adminManualOnly: false,
        },
      ]);
      listSpecialistsMock.mockResolvedValue([{ id: specialistId, organizationId: ORGANIZATION_A, isActive: true }]);
      listSpecialistServiceAvailabilityMock.mockResolvedValue([
        { organizationId: ORGANIZATION_A, specialistId, serviceId, branchId, isActive: true },
      ]);
      resolveCanonicalInPersonContextMock.mockResolvedValue({
        organizationId: ORGANIZATION_A,
        branchId,
        serviceId,
        durationMinutes: 75,
      });

      await expect(
        loadPublicInPersonSlotContextForSlugRsc({ orgSlug: "clinic-a", branchId, serviceId }),
      ).resolves.toMatchObject({
        ok: true,
        cityCode: "moscow",
        cityTitle: "Москва",
        serviceTitle: "Каноническая услуга",
        durationMinutes: 75,
      });
    });

    it("fails closed when the canonical availability is absent", async () => {
      resolveCanonicalSlugMock.mockResolvedValue({
        organizationId: ORGANIZATION_A,
        requestedSlug: "clinic-a",
        canonicalSlug: "clinic-a",
        disposition: "current",
      });
      getBranchMock.mockResolvedValue(null);
      await expect(
        loadPublicInPersonSlotContextForSlugRsc({
          orgSlug: "clinic-a",
          branchId: "33333333-3333-4333-8333-333333333333",
          serviceId: "44444444-4444-4444-8444-444444444444",
        }),
      ).resolves.toEqual({ ok: false });
    });
  });
});
