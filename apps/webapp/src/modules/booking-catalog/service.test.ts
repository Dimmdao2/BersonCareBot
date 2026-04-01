import { describe, expect, it, vi } from "vitest";
import { createBookingCatalogService } from "./service";
import type { BookingCatalogReadPort } from "./ports";
import type { BookingCity, BookingBranchService, ResolvedBranchService } from "./types";

const mockCity: BookingCity = {
  id: "city-1",
  code: "moscow",
  title: "Москва",
  isActive: true,
  sortOrder: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const mockBranchService: BookingBranchService = {
  id: "bbs-1",
  branchId: "branch-1",
  serviceId: "svc-1",
  specialistId: "sp-1",
  rubitimeServiceId: "67452",
  isActive: true,
  sortOrder: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const mockResolved: ResolvedBranchService = {
  branchService: mockBranchService,
  branch: {
    id: "branch-1",
    cityId: "city-1",
    title: "Москва. Точка Здоровья",
    address: "Красносельский тупик, 5",
    rubitimeBranchId: "17356",
    isActive: true,
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  service: {
    id: "svc-1",
    title: "Сеанс 60 мин",
    description: null,
    durationMinutes: 60,
    priceMinor: 600000,
    isActive: true,
    sortOrder: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  specialist: {
    id: "sp-1",
    branchId: "branch-1",
    fullName: "Дмитрий Берсон",
    description: null,
    rubitimeCooperatorId: "34729",
    isActive: true,
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  city: mockCity,
};

function makePort(overrides: Partial<BookingCatalogReadPort> = {}): BookingCatalogReadPort {
  return {
    listCitiesForPatient: vi.fn(async () => [mockCity]),
    listServicesByCity: vi.fn(async () => [mockBranchService]),
    resolveBranchService: vi.fn(async () => mockResolved),
    ...overrides,
  };
}

describe("createBookingCatalogService", () => {
  describe("listCitiesForPatient", () => {
    it("delegates to port and returns cities", async () => {
      const port = makePort();
      const svc = createBookingCatalogService(port);
      const cities = await svc.listCitiesForPatient();
      expect(cities).toHaveLength(1);
      expect(cities[0]!.code).toBe("moscow");
      expect(port.listCitiesForPatient).toHaveBeenCalledOnce();
    });
  });

  describe("listServicesByCity", () => {
    it("normalizes city code and delegates", async () => {
      const port = makePort();
      const svc = createBookingCatalogService(port);
      await svc.listServicesByCity("  Moscow  ");
      expect(port.listServicesByCity).toHaveBeenCalledWith("moscow");
    });

    it("throws city_code_required for empty input", async () => {
      const svc = createBookingCatalogService(makePort());
      await expect(svc.listServicesByCity("  ")).rejects.toThrow("city_code_required");
    });
  });

  describe("resolveBranchService", () => {
    it("returns resolved record when port returns data", async () => {
      const svc = createBookingCatalogService(makePort());
      const result = await svc.resolveBranchService("bbs-1");
      expect(result.branchService.id).toBe("bbs-1");
      expect(result.service.title).toBe("Сеанс 60 мин");
    });

    it("throws branch_service_not_found when port returns null", async () => {
      const port = makePort({ resolveBranchService: vi.fn(async () => null) });
      const svc = createBookingCatalogService(port);
      await expect(svc.resolveBranchService("unknown-id")).rejects.toThrow(
        "branch_service_not_found",
      );
    });
  });
});
