import { describe, expect, it, vi } from "vitest";
const listActivePackagesForBookingMock = vi.hoisted(() => vi.fn());
const listPatientPackagesForUserMock = vi.hoisted(() => vi.fn());
const listCatalogPackagesForPatientMock = vi.hoisted(() => vi.fn());
const getPatientPackageDetailMock = vi.hoisted(() => vi.fn());
const requirePatientApiBusinessAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app-layer/guards/requireRole")>();
  return {
    ...actual,
    requirePatientApiBusinessAccess: requirePatientApiBusinessAccessMock,
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    memberships: {
      listActivePackagesForBooking: listActivePackagesForBookingMock,
      listPatientPackagesForUser: listPatientPackagesForUserMock,
      listCatalogPackagesForPatient: listCatalogPackagesForPatientMock,
      getPatientPackageDetail: getPatientPackageDetailMock,
    },
    bookingEngine: { organization: { getDefaultOrganizationId: async () => "org-1" } },
    bookingScheduling: {
      resolveInPersonContext: async (id: string) =>
        id === "bs-1" ? { serviceId: "svc-1" } : null,
    },
  }),
}));

import { GET as getAvailable } from "./memberships/available/route";
import { GET as getMemberships } from "./memberships/route";
import { GET as getCatalog } from "./memberships/catalog/route";
import { GET as getDetail } from "./memberships/[id]/route";

requirePatientApiBusinessAccessMock.mockResolvedValue({
  ok: true,
  session: { user: { userId: "u1", role: "client" as const } },
});

describe("booking membership routes", () => {
  it("GET available resolves branchServiceId", async () => {
    listActivePackagesForBookingMock.mockResolvedValue([{ id: "pp-1" }]);
    const res = await getAvailable(
      new Request("http://localhost/api/booking/memberships/available?branchServiceId=bs-1"),
    );
    expect(res.status).toBe(200);
    expect(listActivePackagesForBookingMock).toHaveBeenCalledWith("u1", "org-1", "svc-1");
  });

  it("GET memberships lists patient packages", async () => {
    listPatientPackagesForUserMock.mockResolvedValue([]);
    const res = await getMemberships();
    expect(res.status).toBe(200);
  });

  it("GET catalog returns products", async () => {
    listCatalogPackagesForPatientMock.mockResolvedValue([]);
    const res = await getCatalog();
    expect(res.status).toBe(200);
  });

  it("GET detail returns 404 for foreign package", async () => {
    getPatientPackageDetailMock.mockResolvedValue({
      package: { platformUserId: "other" },
      usages: [],
      history: [],
    });
    const res = await getDetail(new Request("http://x"), { params: Promise.resolve({ id: "pp-1" }) });
    expect(res.status).toBe(404);
  });
});
