import { describe, expect, it, vi } from "vitest";
import { createBookingCatalogService } from "./service";
import type { BookingCatalogReadPort } from "./ports";
import type { BookingCity, BookingBranchService } from "./types";

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

function makePort(overrides: Partial<BookingCatalogReadPort> = {}): BookingCatalogReadPort {
  return {
    listCitiesForPatient: vi.fn(async () => [mockCity]),
    listServicesByCity: vi.fn(async () => [mockBranchService]),
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
});
