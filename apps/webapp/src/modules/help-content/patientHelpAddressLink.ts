import { routePaths } from "@/app-layer/routes/paths";
import {
  HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_MSK,
  HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_SPB,
} from "./canonicalSlugs";

/** Нормализованный код города каталога записи (`booking_cities.code`). */
export type BookingCatalogCityCode = "moscow" | "spb";

const MSK_ALIASES = new Set(["moscow", "msk", "moskva"]);
const SPB_ALIASES = new Set(["spb", "sankt-peterburg", "saint-petersburg", "petersburg"]);

/**
 * Приводит `cityCode` из каталога/снимка записи к канону `moscow` | `spb`.
 * Неизвестные коды → `null` (fallback на `/app/patient/address`).
 */
export function normalizeBookingCatalogCityCode(
  cityCode: string | null | undefined,
): BookingCatalogCityCode | null {
  const n = cityCode?.trim().toLowerCase();
  if (!n) return null;
  if (MSK_ALIASES.has(n)) return "moscow";
  if (SPB_ALIASES.has(n)) return "spb";
  return null;
}

/**
 * Href плитки «Адрес кабинета»: help-статья `address-msk` / `address-spb` при опубликованном slug и известном городе;
 * иначе `/app/patient/address`.
 */
export function resolvePatientAddressHref(
  publishedHelpSlugs: ReadonlySet<string>,
  bookingCityCode: string | null | undefined,
): string {
  const catalogCity = normalizeBookingCatalogCityCode(bookingCityCode);
  if (catalogCity === "moscow" && publishedHelpSlugs.has(HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_MSK)) {
    return routePaths.patientHelpArticle(HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_MSK);
  }
  if (catalogCity === "spb" && publishedHelpSlugs.has(HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_SPB)) {
    return routePaths.patientHelpArticle(HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_SPB);
  }
  return routePaths.patientAddress;
}

/**
 * Контекст города для плиток на «Запись»: query `cityCode` (если распознан), иначе ближайшая предстоящая запись.
 * Нераспознанный `?cityCode=` не блокирует fallback на `cityCodeSnapshot`.
 */
export function pickBookingCityCodeForAddressLinks(
  searchParamsCityCode: string | null | undefined,
  upcomingCitySnapshots: readonly (string | null | undefined)[],
): string | null {
  const fromQuery = searchParamsCityCode?.trim();
  if (fromQuery && normalizeBookingCatalogCityCode(fromQuery)) {
    return fromQuery;
  }
  for (const snapshot of upcomingCitySnapshots) {
    const s = snapshot?.trim();
    if (s) return s;
  }
  return null;
}
