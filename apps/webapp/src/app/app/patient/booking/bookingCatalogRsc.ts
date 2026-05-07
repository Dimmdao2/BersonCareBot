import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { BookingBranchService, BookingCity } from "@/modules/booking-catalog/types";

export type LoadCitiesResult =
  | { ok: true; cities: BookingCity[] }
  | { ok: false; error: "catalog_unavailable"; cities: [] };

export type LoadServicesResult =
  | { ok: true; services: BookingBranchService[] }
  | { ok: false; error: "catalog_unavailable" | "city_not_found"; services: [] };

/** RSC: каталог городов (тот же источник, что `GET /api/booking/catalog/cities`). */
export async function loadBookingCitiesForPatientRsc(): Promise<LoadCitiesResult> {
  const deps = buildAppDeps();
  if (!deps.bookingCatalog) {
    return { ok: false, error: "catalog_unavailable", cities: [] };
  }
  try {
    const cities = await deps.bookingCatalog.listCitiesForPatient();
    return { ok: true, cities };
  } catch {
    return { ok: false, error: "catalog_unavailable", cities: [] };
  }
}

/** RSC: услуги города (тот же источник, что `GET /api/booking/catalog/services`). */
export async function loadBookingServicesForPatientRsc(cityCode: string): Promise<LoadServicesResult> {
  const deps = buildAppDeps();
  if (!deps.bookingCatalog) {
    return { ok: false, error: "catalog_unavailable", services: [] };
  }
  try {
    const services = await deps.bookingCatalog.listServicesByCity(cityCode);
    return { ok: true, services };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "city_not_found" || msg === "city_code_required") {
      return { ok: false, error: "city_not_found", services: [] };
    }
    return { ok: false, error: "catalog_unavailable", services: [] };
  }
}
