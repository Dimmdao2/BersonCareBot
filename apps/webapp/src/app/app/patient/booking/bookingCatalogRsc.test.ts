import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveActiveOrganizationForPatientMock = vi.hoisted(() => vi.fn());
const listBranchesMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const listSpecialistsMock = vi.hoisted(() => vi.fn());
const listServicesMock = vi.hoisted(() => vi.fn());
const listServiceLocationAvailabilityMock = vi.hoisted(() => vi.fn());
const listSpecialistServiceAvailabilityMock = vi.hoisted(() => vi.fn());
const withExplicitOrganizationPrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: { organizationId: string; source: string }, fn: () => Promise<unknown>) => fn()),
);

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientOrganization: {
      resolveActiveOrganizationForPatient: resolveActiveOrganizationForPatientMock,
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
  loadBookingCitiesForPatientRsc,
  loadInPersonServicesForCityRsc,
} from "./bookingCatalogRsc";

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const PATIENT_ID = "11111111-1111-4111-8111-111111111111";

describe("patient booking catalog RSC principal boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveActiveOrganizationForPatientMock.mockResolvedValue({
      ok: true,
      organizationId: ORGANIZATION_ID,
    });
  });

  it("reads cities under the organization resolved from the patient enrollment", async () => {
    listBranchesMock.mockResolvedValue([
      {
        id: "33333333-3333-4333-8333-333333333333",
        organizationId: ORGANIZATION_ID,
        cityCode: "moscow",
        title: "Москва",
        isActive: true,
        sortOrder: 0,
      },
    ]);

    await expect(loadBookingCitiesForPatientRsc(PATIENT_ID)).resolves.toMatchObject({
      ok: true,
      cities: [{ code: "moscow", title: "Москва" }],
    });
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledOnce();
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, source: "app/patient/booking:load-cities" },
      expect.any(Function),
    );
    expect(listBranchesMock).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it("fails closed without an active patient enrollment and never enters an organization principal", async () => {
    resolveActiveOrganizationForPatientMock.mockResolvedValue({
      ok: false,
      reason: "no_active_enrollment",
    });

    await expect(loadBookingCitiesForPatientRsc(PATIENT_ID)).resolves.toEqual({
      ok: false,
      error: "catalog_unavailable",
      cities: [],
    });
    expect(withExplicitOrganizationPrincipalMock).not.toHaveBeenCalled();
    expect(listBranchesMock).not.toHaveBeenCalled();
  });

  it("keeps the service catalog read inside the resolved organization principal", async () => {
    const branchId = "33333333-3333-4333-8333-333333333333";
    listBranchesMock.mockResolvedValue([
      {
        id: branchId,
        organizationId: ORGANIZATION_ID,
        cityCode: "moscow",
        title: "Москва",
        isActive: true,
        sortOrder: 0,
      },
    ]);
    getBranchMock.mockResolvedValue({
      id: branchId,
      organizationId: ORGANIZATION_ID,
      cityCode: "moscow",
      title: "Москва",
      isActive: true,
    });
    listServicesMock.mockResolvedValue([]);
    listServiceLocationAvailabilityMock.mockResolvedValue([]);
    listSpecialistServiceAvailabilityMock.mockResolvedValue([]);
    listSpecialistsMock.mockResolvedValue([]);

    await expect(loadInPersonServicesForCityRsc("moscow", PATIENT_ID)).resolves.toMatchObject({
      ok: true,
      branchId,
      cityCode: "moscow",
      services: [],
    });
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledOnce();
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, source: "app/patient/booking:load-services" },
      expect.any(Function),
    );
    expect(getBranchMock).toHaveBeenCalledWith(branchId);
    expect(listServicesMock).toHaveBeenCalledWith(ORGANIZATION_ID);
  });
});
