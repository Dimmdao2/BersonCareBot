import type { BookingCatalogReadPort } from "./ports";
import type { BookingCity, BookingBranchService, ResolvedBranchService } from "./types";

export type BookingCatalogService = {
  /** Returns active cities for patient selection screen. */
  listCitiesForPatient(): Promise<BookingCity[]>;

  /**
   * Returns active services available in the given city.
   * Throws "city_not_found" if no such active city exists.
   */
  listServicesByCity(cityCode: string): Promise<BookingBranchService[]>;

  /**
   * Resolves a branch-service by id for booking creation.
   * Throws "branch_service_not_found" if id is unknown or inactive.
   */
  resolveBranchService(branchServiceId: string): Promise<ResolvedBranchService>;
};

export function createBookingCatalogService(
  port: BookingCatalogReadPort,
): BookingCatalogService {
  return {
    async listCitiesForPatient() {
      return port.listCitiesForPatient();
    },

    async listServicesByCity(cityCode) {
      const normalized = cityCode.trim().toLowerCase();
      if (!normalized) throw new Error("city_code_required");
      const services = await port.listServicesByCity(normalized);
      return services;
    },

    async resolveBranchService(branchServiceId) {
      const result = await port.resolveBranchService(branchServiceId);
      if (!result) throw new Error("branch_service_not_found");
      return result;
    },
  };
}
